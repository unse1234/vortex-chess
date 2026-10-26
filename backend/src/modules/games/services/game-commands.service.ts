import { Injectable, Logger } from '@nestjs/common';
import { performance } from 'node:perf_hooks';
import { RealtimePublisher } from '../../realtime/realtime-publisher.service';
import { gameChannel } from '../../realtime/realtime.contracts';
import {
  afterMove,
  deadlineOf,
  hasFlagFallen,
  readingAt,
} from '../clocks/game-clock';
import { ServerClock } from '../clocks/server-clock';
import { toLiveView, type GameLiveView } from '../game-view';
import type {
  DrawResponseInput,
  MoveCommandInput,
  SimpleCommandInput,
} from '../games.schemas';
import {
  cannotCheckmate,
  evaluateMove,
  historyOutcome,
  opposite,
  type Color,
  type MoveRejection,
  type Outcome,
} from '../rules/chess-rules';
import { GameMetrics } from './game-metrics';
import { GameRepository, type CommandRecord } from './game-repository';
import {
  colorOf,
  commandKey,
  finishState,
  type GameRuntime,
  type GameState,
  type MoveRecord,
} from './game-state';
import { GameStore } from './game-store';

/** When the server received a command: wall time for the clock, monotonic for metrics. */
export type CommandContext = { receivedAt: number; receivedPerf: number };

export type CommandError = {
  status: number;
  code: string;
  message: string;
  /** Retrying the identical command (same request id) may succeed. */
  retryable: boolean;
};

export type CommandResult =
  | { ok: true; duplicate: boolean; game: GameLiveView }
  | { ok: false; error: CommandError; game: GameLiveView | null };

const fail = (
  status: number,
  code: string,
  message: string,
  retryable = false,
): CommandError => ({ status, code, message, retryable });

const errors = {
  notFound: fail(404, 'game_not_found', "This game doesn't exist, or you aren't playing in it."),
  reused: fail(409, 'request_id_reused', 'This request id was already used for a different command.'),
  finished: fail(409, 'game_finished', 'This game has already finished.'),
  timeExpired: fail(409, 'game_finished', 'Time ran out before this command arrived.'),
  stale: fail(409, 'stale_revision', 'The game changed. Review the latest position and try again.'),
  notYourTurn: fail(409, 'not_your_turn', "It isn't your turn to move."),
  offerPending: fail(409, 'draw_offer_pending', 'Your opponent has offered a draw. Accept or decline it.'),
  offerCooldown: fail(409, 'draw_offer_cooldown', 'Your draw offer was declined. Make a move before offering again.'),
  noOffer: fail(409, 'no_draw_offer', 'There is no draw offer to answer.'),
  unavailable: fail(503, 'game_unavailable', 'The game could not be loaded. Try again.', true),
  notSaved: fail(503, 'command_not_saved', 'The command could not be saved. Try again.', true),
  conflict: fail(503, 'game_state_conflict', 'The game was changed elsewhere. Try again.', true),
};

const rejections: Record<MoveRejection, CommandError> = {
  illegal_move: fail(422, 'illegal_move', "That move isn't legal in this position."),
  promotion_required: fail(422, 'promotion_required', 'Choose the piece to promote to.'),
  promotion_not_allowed: fail(422, 'promotion_not_allowed', 'Only a pawn reaching the last rank promotes.'),
};

/** A computed but uncommitted change to a game. */
type Change = {
  next: GameState;
  command: CommandRecord | null;
  move?: { record: MoveRecord; repetitionKey: string; occurrences: number };
};
type Decision = Change | CommandError | 'unchanged';

/**
 * The authoritative game pipeline. HTTP, realtime and timers all call these
 * methods; each runs in its game's serial lane, so moves, draw actions,
 * resignation and timeouts are decided one at a time against committed state.
 * A change becomes visible (memory, acknowledgement, broadcast) only after its
 * database statement has committed.
 */
@Injectable()
export class GameCommandsService {
  private readonly logger = new Logger(GameCommandsService.name);

  constructor(
    private readonly store: GameStore,
    private readonly repository: GameRepository,
    private readonly publisher: RealtimePublisher,
    private readonly clock: ServerClock,
    private readonly metrics: GameMetrics,
  ) {}

  move(actorId: string, gameId: string, input: MoveCommandInput, ctx: CommandContext) {
    const fingerprint = `move:${input.from}${input.to}${input.promotion ?? ''}@${input.expectedRevision}`;
    return this.execute(gameId, actorId, input.requestId, fingerprint, ctx, (runtime, color) => {
      const { state } = runtime;
      if (input.expectedRevision !== state.revision) return errors.stale;
      if (state.facts.turn !== color) return errors.notYourTurn;
      const evaluated = evaluateMove(state.fen, input);
      if (!evaluated.ok) return rejections[evaluated.reason];
      const played = evaluated.move;
      const { elapsedMs, clock } = afterMove(state.clock, color, ctx.receivedAt, state.incrementMs);
      const occurrences = (runtime.repetitions.get(played.repetitionKey) ?? 0) + 1;
      const outcome = played.outcome ?? historyOutcome(played.fenAfter, occurrences);
      const record: MoveRecord = {
        ply: state.ply + 1,
        color,
        actorId,
        requestId: input.requestId,
        uci: played.uci,
        san: played.san,
        from: played.from,
        to: played.to,
        promotion: played.promotion,
        captured: played.captured,
        fenAfter: played.fenAfter,
        playedAt: ctx.receivedAt,
        elapsedMs,
        remainingMs: clock.remainingMs,
      };
      // Moving declines the opponent's pending offer; the mover's own offer stands.
      const opponentOffer = state.draw.offerBy === opposite(color);
      let next: GameState = {
        ...state,
        revision: state.revision + 1,
        ply: record.ply,
        fen: played.fenAfter,
        clock,
        facts: played.after,
        draw: {
          offerBy: state.draw.offerBy === color ? color : null,
          declinedBy: opponentOffer ? opposite(color) : null,
        },
      };
      if (outcome)
        next = finishState(next, outcome, ctx.receivedAt, clock.remainingMs, [
          ...runtime.moves.map((m) => m.san),
          played.san,
        ]);
      return {
        next,
        command: { actorId, requestId: input.requestId, kind: 'MOVE', fingerprint },
        move: { record, repetitionKey: played.repetitionKey, occurrences },
      };
    });
  }

  resign(actorId: string, gameId: string, input: SimpleCommandInput, ctx: CommandContext) {
    return this.execute(gameId, actorId, input.requestId, 'resign', ctx, (runtime, color) => ({
      next: this.finish(runtime, { winner: opposite(color), termination: 'resignation' }, ctx.receivedAt),
      command: { actorId, requestId: input.requestId, kind: 'RESIGN', fingerprint: 'resign' },
    }));
  }

  offerDraw(actorId: string, gameId: string, input: SimpleCommandInput, ctx: CommandContext) {
    const fingerprint = 'draw.offer';
    return this.execute(gameId, actorId, input.requestId, fingerprint, ctx, ({ state }, color) => {
      if (state.draw.offerBy === color) return 'unchanged';
      if (state.draw.offerBy) return errors.offerPending;
      if (state.draw.declinedBy === color) return errors.offerCooldown;
      return {
        next: { ...state, revision: state.revision + 1, draw: { offerBy: color, declinedBy: null } },
        command: { actorId, requestId: input.requestId, kind: 'OFFER_DRAW', fingerprint },
      };
    });
  }

  respondToDraw(actorId: string, gameId: string, input: DrawResponseInput, ctx: CommandContext) {
    const fingerprint = `draw.${input.response}`;
    return this.execute(gameId, actorId, input.requestId, fingerprint, ctx, (runtime, color) => {
      const { state } = runtime;
      if (state.draw.offerBy !== opposite(color)) return errors.noOffer;
      const next =
        input.response === 'accept'
          ? this.finish(runtime, { winner: null, termination: 'agreement' }, ctx.receivedAt)
          : {
              ...state,
              revision: state.revision + 1,
              draw: { offerBy: null, declinedBy: opposite(color) },
            };
      return {
        next,
        command: {
          actorId,
          requestId: input.requestId,
          kind: input.response === 'accept' ? 'ACCEPT_DRAW' : 'DECLINE_DRAW',
          fingerprint,
        },
      };
    });
  }

  /**
   * Timer path. Runs in the game's lane like any command and decides from the
   * current server time, so a late timer still ends the game correctly and an
   * early one simply reschedules.
   */
  checkTimeout(gameId: string) {
    return this.store.lanes.run(gameId, async () => {
      let runtime: GameRuntime | null;
      try {
        runtime = await this.runtime(gameId);
      } catch {
        this.retryTimeoutLater(gameId);
        return;
      }
      if (!runtime || runtime.state.status !== 'active') return;
      const at = this.clock.now();
      if (!hasFlagFallen(runtime.state.clock, runtime.state.facts.turn, at)) {
        this.scheduleTimeout(runtime);
        return;
      }
      const result = await this.commit(runtime, this.timeoutChange(runtime, at));
      if ('error' in result) this.retryTimeoutLater(gameId);
    });
  }

  /** Loads a game into warm state and arms its clock timer. */
  async runtime(gameId: string) {
    const runtime = await this.store.get(gameId);
    if (runtime?.state.status === 'active' && !runtime.timer) this.scheduleTimeout(runtime);
    return runtime;
  }

  view(runtime: GameRuntime, viewerId: string) {
    return toLiveView(runtime.state, viewerId, this.clock.now(), runtime.moves.at(-1));
  }

  private execute(
    gameId: string,
    actorId: string,
    requestId: string,
    fingerprint: string,
    ctx: CommandContext,
    decide: (runtime: GameRuntime, color: Color) => Decision,
  ): Promise<CommandResult> {
    return this.store.lanes.run(gameId, async () => {
      const dequeuedPerf = performance.now();
      let runtime: GameRuntime | null;
      try {
        runtime = await this.runtime(gameId);
      } catch (error) {
        this.logger.error(`Game load failed: ${error instanceof Error ? error.message : 'unknown'}`);
        return { ok: false, error: errors.unavailable, game: null };
      }
      const color = runtime && colorOf(runtime.state, actorId);
      if (!runtime || !color) return { ok: false, error: errors.notFound, game: null };
      const rejected = (error: CommandError): CommandResult => ({
        ok: false,
        error,
        game: this.view(runtime, actorId),
      });

      const prior = runtime.commands.get(commandKey(actorId, requestId));
      if (prior)
        return prior.fingerprint === fingerprint
          ? { ok: true, duplicate: true, game: this.view(runtime, actorId)! }
          : rejected(errors.reused);
      if (runtime.state.status === 'finished') return rejected(errors.finished);
      // The official clock is read at receipt, before anything else is decided.
      if (hasFlagFallen(runtime.state.clock, runtime.state.facts.turn, ctx.receivedAt)) {
        const result = await this.commit(runtime, this.timeoutChange(runtime, ctx.receivedAt));
        return rejected('error' in result ? result.error : errors.timeExpired);
      }

      const decision = decide(runtime, color);
      if (decision === 'unchanged')
        return { ok: true, duplicate: false, game: this.view(runtime, actorId)! };
      if ('code' in decision) return rejected(decision);
      const validatedPerf = performance.now();

      const result = await this.commit(runtime, decision);
      if ('error' in result) return rejected(result.error);
      if (decision.move) {
        const emitted = performance.now();
        this.metrics.record({
          queueMs: dequeuedPerf - ctx.receivedPerf,
          validateMs: validatedPerf - dequeuedPerf,
          commitMs: result.committedPerf - validatedPerf,
          emitMs: emitted - result.committedPerf,
          totalMs: emitted - ctx.receivedPerf,
        });
      }
      const game = toLiveView(
        runtime.state,
        actorId,
        this.clock.now(),
        runtime.moves.at(-1),
        decision.move?.record ?? null,
      )!;
      return { ok: true, duplicate: false, game };
    });
  }

  /**
   * Persists a change, then (only on success) publishes it: warm state,
   * timers and the broadcast. A failed or ambiguous write leaves the published
   * state untouched and drops the warm copy, so the next command reloads the
   * committed truth; a retry with the same request id is then answered from
   * the persisted ledger if the write had in fact committed.
   */
  private async commit(
    runtime: GameRuntime,
    change: Change,
  ): Promise<{ committedPerf: number } | { error: CommandError }> {
    const expectedRevision = runtime.state.revision;
    try {
      const saved = change.move
        ? await this.repository.commitMove({
            expectedRevision,
            next: change.next,
            move: change.move.record,
            command: change.command!,
          })
        : await this.repository.commitChange({
            expectedRevision,
            next: change.next,
            command: change.command,
          });
      if (!saved) {
        this.store.evict(change.next.id);
        return { error: errors.conflict };
      }
    } catch (error) {
      this.logger.warn(
        `Game write failed: ${error instanceof Error ? error.message.split('\n')[0] : 'unknown'}`,
      );
      this.store.evict(change.next.id);
      return { error: errors.notSaved };
    }
    const committedPerf = performance.now();

    runtime.state = change.next;
    if (change.move) {
      runtime.moves.push(change.move.record);
      runtime.repetitions.set(change.move.repetitionKey, change.move.occurrences);
    }
    if (change.command)
      runtime.commands.set(commandKey(change.command.actorId, change.command.requestId), {
        fingerprint: change.command.fingerprint,
        revision: change.next.revision,
      });
    this.scheduleTimeout(runtime);
    await this.broadcast(runtime, change.move?.record ?? null);
    return { committedPerf };
  }

  private broadcast(runtime: GameRuntime, move: MoveRecord | null) {
    const now = this.clock.now();
    const { state } = runtime;
    const lastMove = runtime.moves.at(-1);
    return this.publisher.toChannelViewers(gameChannel(state.id), 'game.updated', (viewerId) =>
      toLiveView(state, viewerId, now, lastMove, move),
    );
  }

  private finish(runtime: GameRuntime, outcome: Outcome, at: number) {
    const { state } = runtime;
    return finishState(
      { ...state, revision: state.revision + 1 },
      outcome,
      at,
      readingAt(state.clock, state.facts.turn, at),
      runtime.moves.map((m) => m.san),
    );
  }

  /** The side to move has no time left; FIDE 6.9 decides win or draw. */
  private timeoutChange(runtime: GameRuntime, at: number): Change {
    const { state } = runtime;
    const loser = state.facts.turn;
    const winner = opposite(loser);
    const outcome: Outcome = cannotCheckmate(state.fen, winner)
      ? { winner: null, termination: 'timeout-vs-insufficient-material' }
      : { winner, termination: 'timeout' };
    const remainingMs = { ...state.clock.remainingMs, [loser]: 0 } as Record<Color, number>;
    return {
      next: finishState(
        { ...state, revision: state.revision + 1 },
        outcome,
        at,
        remainingMs,
        runtime.moves.map((m) => m.san),
      ),
      command: null,
    };
  }

  private scheduleTimeout(runtime: GameRuntime) {
    clearTimeout(runtime.timer);
    runtime.timer = undefined;
    if (runtime.state.status !== 'active') return;
    const { id, clock, facts } = runtime.state;
    const delay = Math.max(0, deadlineOf(clock, facts.turn) - this.clock.now());
    runtime.timer = setTimeout(() => void this.checkTimeout(id), Math.min(delay + 1, 2_147_483_647));
    runtime.timer.unref();
  }

  private retryTimeoutLater(gameId: string) {
    setTimeout(() => void this.checkTimeout(gameId), 1_000).unref();
  }
}
