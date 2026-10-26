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
  parseUciMove,
  type Color,
  type MoveRejection,
  type MoveRequest,
  type Outcome,
} from '../rules/chess-rules';
import { GameMetrics } from './game-metrics';
import { GameRepository, type CommandRecord } from './game-repository';
import {
  colorOf,
  commandKey,
  engineTurnRequestId,
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
  noDrawsWithEngine: fail(409, 'draw_offers_unavailable', 'Draw offers are not available in engine games.'),
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

/** The engine turn a reply belongs to, captured when its search was scheduled. */
export type EngineTurnRef = { gameId: string; revision: number; color: Color };

export type EngineApplyResult =
  | { status: 'applied'; game: GameState }
  /** The game moved on (finished, another revision, not the engine's turn): the reply is discarded. */
  | { status: 'stale'; reason: 'missing' | 'finished' | 'revision' | 'turn' }
  /** The engine's clock had run out when the reply arrived; normal timeout adjudication applied. */
  | { status: 'timeout' }
  /** The reply is not a legal move in the authoritative position. */
  | { status: 'illegal'; reason: MoveRejection | 'malformed' }
  /** Loading or saving failed and nothing was published. The same turn may be applied again. */
  | { status: 'unavailable' };

type CommitListener = (runtime: GameRuntime) => void;

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
  private readonly listeners = new Set<CommitListener>();

  constructor(
    private readonly store: GameStore,
    private readonly repository: GameRepository,
    private readonly publisher: RealtimePublisher,
    private readonly clock: ServerClock,
    private readonly metrics: GameMetrics,
  ) {}

  /**
   * Called after every committed change has been published. Engine
   * orchestration uses it to notice engine turns; listeners must not block.
   */
  onCommitted(listener: CommitListener) {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  move(actorId: string, gameId: string, input: MoveCommandInput, ctx: CommandContext) {
    const fingerprint = `move:${input.from}${input.to}${input.promotion ?? ''}@${input.expectedRevision}`;
    return this.execute(gameId, actorId, input.requestId, fingerprint, ctx, (runtime, color) => {
      const { state } = runtime;
      if (input.expectedRevision !== state.revision) return errors.stale;
      if (state.facts.turn !== color) return errors.notYourTurn;
      const change = this.moveChange(runtime, color, input, actorId, input.requestId, ctx.receivedAt);
      if ('reason' in change) return rejections[change.reason];
      return { ...change, command: { actorId, requestId: input.requestId, kind: 'MOVE', fingerprint } };
    });
  }

  /**
   * Applies the engine's reply for one turn. Only internal orchestration calls
   * this; no account can act for the engine seat. It runs in the game's lane
   * like any command and re-checks committed state (still active, same
   * revision, engine to move) and the official clock at receipt, then
   * validates the move with chess.js and commits it through the same pipeline
   * as a player's move. A reply for an older revision is discarded even if it
   * happens to be legal in the newer position.
   */
  applyEngineMove(turn: EngineTurnRef, uci: string, ctx: CommandContext): Promise<EngineApplyResult> {
    return this.store.lanes.run(turn.gameId, async () => {
      const dequeuedPerf = performance.now();
      const checked = await this.checkEngineTurn(turn, ctx.receivedAt);
      if ('status' in checked) return checked;
      const request = parseUciMove(uci);
      if (!request) return { status: 'illegal', reason: 'malformed' };
      const change = this.moveChange(
        checked,
        turn.color,
        request,
        null,
        engineTurnRequestId(turn.gameId, turn.revision),
        ctx.receivedAt,
      );
      if ('reason' in change) return { status: 'illegal', reason: change.reason };
      const validatedPerf = performance.now();
      const result = await this.commit(checked, { ...change, command: null });
      if ('error' in result) return { status: 'unavailable' };
      const emitted = performance.now();
      this.metrics.record({
        queueMs: dequeuedPerf - ctx.receivedPerf,
        validateMs: validatedPerf - dequeuedPerf,
        commitMs: result.committedPerf - validatedPerf,
        emitMs: emitted - result.committedPerf,
        totalMs: emitted - ctx.receivedPerf,
      });
      return { status: 'applied', game: checked.state };
    });
  }

  /**
   * Infrastructure-failure policy for engine games: after bounded recovery
   * attempts the game ends as aborted, with no winner and no draw. If the
   * engine's clock has already run out, normal timeout adjudication applies
   * instead. A service failure alone never awards a win.
   */
  abortForEngineFailure(turn: EngineTurnRef, at: number): Promise<EngineApplyResult> {
    return this.store.lanes.run(turn.gameId, async () => {
      const checked = await this.checkEngineTurn(turn, at);
      if ('status' in checked) return checked;
      const result = await this.commit(checked, {
        next: this.finish(checked, { winner: null, termination: 'engine-failure' }, at),
        command: null,
      });
      return 'error' in result ? { status: 'unavailable' } : { status: 'applied', game: checked.state };
    });
  }

  /**
   * Broadcasts the committed state again. Used when a write may have committed
   * without its reply (so nothing was published): subscribers apply it as the
   * next revision, or detect the gap and resynchronize from a snapshot.
   */
  republish(gameId: string) {
    return this.store.lanes.run(gameId, async () => {
      this.store.evict(gameId);
      const runtime = await this.runtime(gameId).catch(() => null);
      if (runtime) await this.broadcast(runtime, runtime.moves.at(-1) ?? null);
    });
  }

  /** In the lane: the turn is still current, and the engine still had time at `at`. */
  private async checkEngineTurn(
    turn: EngineTurnRef,
    at: number,
  ): Promise<GameRuntime | Exclude<EngineApplyResult, { status: 'applied' | 'illegal' }>> {
    let runtime: GameRuntime | null;
    try {
      runtime = await this.runtime(turn.gameId);
    } catch {
      return { status: 'unavailable' };
    }
    if (!runtime) return { status: 'stale', reason: 'missing' };
    const { state } = runtime;
    if (state.status !== 'active') return { status: 'stale', reason: 'finished' };
    if (state.revision !== turn.revision) return { status: 'stale', reason: 'revision' };
    if (state.facts.turn !== turn.color || state.players[turn.color].kind !== 'engine')
      return { status: 'stale', reason: 'turn' };
    if (hasFlagFallen(state.clock, turn.color, at)) {
      const result = await this.commit(runtime, this.timeoutChange(runtime, at));
      if ('error' in result) this.retryTimeoutLater(turn.gameId);
      return { status: 'timeout' };
    }
    return runtime;
  }

  /**
   * The one move computation for players and the engine: chess.js validation,
   * official clock charge and increment, repetition and every game-ending
   * rule. Nothing changes until the caller commits the result.
   */
  private moveChange(
    runtime: GameRuntime,
    color: Color,
    request: MoveRequest,
    actorId: string | null,
    requestId: string,
    receivedAt: number,
  ): Omit<Change, 'command'> | { reason: MoveRejection } {
    const { state } = runtime;
    const evaluated = evaluateMove(state.fen, request);
    if (!evaluated.ok) return { reason: evaluated.reason };
    const played = evaluated.move;
    const { elapsedMs, clock } = afterMove(state.clock, color, receivedAt, state.incrementMs);
    const occurrences = (runtime.repetitions.get(played.repetitionKey) ?? 0) + 1;
    const outcome = played.outcome ?? historyOutcome(played.fenAfter, occurrences);
    const record: MoveRecord = {
      ply: state.ply + 1,
      color,
      actorId,
      requestId,
      uci: played.uci,
      san: played.san,
      from: played.from,
      to: played.to,
      promotion: played.promotion,
      captured: played.captured,
      fenAfter: played.fenAfter,
      playedAt: receivedAt,
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
      next = finishState(next, outcome, receivedAt, clock.remainingMs, [
        ...runtime.moves.map((m) => m.san),
        played.san,
      ]);
    return { next, move: { record, repetitionKey: played.repetitionKey, occurrences } };
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
      if (state.mode === 'engine') return errors.noDrawsWithEngine;
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
      if (state.mode === 'engine') return errors.noDrawsWithEngine;
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
            command: change.command,
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
    for (const listener of this.listeners) {
      try {
        listener(runtime);
      } catch (error) {
        this.logger.error(`Commit listener failed: ${error instanceof Error ? error.message : 'unknown'}`);
      }
    }
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
