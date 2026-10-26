import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { performance } from 'node:perf_hooks';
import type { Environment } from '../../../config/environment';
import type { EngineError } from '../../engines/engine-errors';
import { EnginesService, type SearchProgress } from '../../engines/engines.service';
import { RealtimePublisher } from '../../realtime/realtime-publisher.service';
import { gameChannel } from '../../realtime/realtime.contracts';
import { engineSearchBudget, type EngineBudgetPolicy } from '../clocks/engine-budget';
import { deadlineOf } from '../clocks/game-clock';
import { ServerClock } from '../clocks/server-clock';
import type { EngineTurnView } from '../game-view';
import { positionFacts } from '../rules/chess-rules';
import {
  GameCommandsService,
  type EngineApplyResult,
  type EngineTurnRef,
} from './game-commands.service';
import { GameRepository } from './game-repository';
import { engineColorOf, type GameState } from './game-state';

/** Saving the engine's move failed (database); it is retried after these delays. */
const APPLY_RETRY_DELAYS_MS = [100, 500, 1_500];

type Turn = {
  ref: EngineTurnRef;
  fen: string;
  /** Server time the engine's clock runs out on this turn. */
  deadline: number;
  phase: EngineTurnView['phase'];
  attempt: number;
  since: number;
  /** A newer state replaced this turn; its reply will be discarded. */
  obsolete: boolean;
  /** The search is over; nothing for this turn is in flight. */
  settled: boolean;
};

/**
 * Server-owned engine turns. After any committed change, if the engine owns
 * the next move it captures the game id, revision, engine colour and
 * authoritative FEN, publishes the thinking state and asks the engine
 * service for a move outside every database transaction and game lane. The
 * reply re-enters the game's lane through GameCommandsService, which applies
 * it only if the same turn is still current.
 *
 * One search per game at a time. A turn is identified by (game, revision), so
 * duplicate scheduling is ignored and a reply can be applied at most once.
 * Browser refreshes, reconnects and extra tabs only read state; they never
 * start a search. Startup and a periodic repair pass reschedule turns that
 * were lost (restart, failed write).
 */
@Injectable()
export class EngineTurnService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EngineTurnService.name);
  private readonly turns = new Map<string, Turn>();
  /** A state to reconsider once the game's in-flight search settles. */
  private readonly deferred = new Map<string, GameState>();
  private readonly publishing = new Map<string, Promise<void>>();
  private readonly shutdown = new AbortController();
  private readonly policy: EngineBudgetPolicy;
  private readonly repairSeconds: number;
  private unsubscribe?: () => void;
  private repairTimer?: NodeJS.Timeout;
  private repairing = false;
  /** Last reported failure of the periodic pass, to avoid repeating it. */
  private repairFailure: string | null = null;

  constructor(
    private readonly commands: GameCommandsService,
    private readonly repository: GameRepository,
    private readonly engines: EnginesService,
    private readonly clock: ServerClock,
    private readonly publisher: RealtimePublisher,
    config: ConfigService<Environment, true>,
  ) {
    this.policy = {
      allowanceMs: config.get('ENGINE_SEARCH_MOVETIME_MS', { infer: true }),
      transportReserveMs: config.get('ENGINE_TRANSPORT_RESERVE_MS', { infer: true }),
      commitReserveMs: config.get('ENGINE_COMMIT_RESERVE_MS', { infer: true }),
      requestTimeoutMs: config.get('ENGINE_REQUEST_TIMEOUT_MS', { infer: true }),
    };
    this.repairSeconds = config.get('ENGINE_RECOVERY_INTERVAL_SECONDS', { infer: true });
  }

  onModuleInit() {
    this.unsubscribe = this.commands.onCommitted((runtime) => this.consider(runtime.state));
    if (this.repairSeconds > 0) {
      this.repairTimer = setInterval(() => void this.recover(), this.repairSeconds * 1000);
      this.repairTimer.unref();
    }
  }

  onModuleDestroy() {
    this.unsubscribe?.();
    clearInterval(this.repairTimer);
    // In-flight requests end as cancelled; a cancelled search never aborts a game.
    this.shutdown.abort();
  }

  /** The engine's search for the game's current revision, for snapshots. */
  view(gameId: string): EngineTurnView | null {
    const turn = this.turns.get(gameId);
    if (!turn || turn.settled || turn.obsolete) return null;
    return {
      revision: turn.ref.revision,
      color: turn.ref.color,
      phase: turn.phase,
      attempt: turn.attempt,
      since: turn.since,
    };
  }

  /**
   * Schedules any engine turn that should be running: after startup (once
   * clocks are resumed), after creating an engine game, and periodically.
   */
  async recover(ids?: readonly string[]) {
    const periodic = !ids;
    if (periodic) {
      if (this.repairing) return;
      this.repairing = true;
    }
    try {
      const gameIds = ids ?? (await this.repository.activeEngineGameIds());
      if (periodic && this.repairFailure) {
        this.logger.log('Engine turn repair recovered');
        this.repairFailure = null;
      }
      for (const id of gameIds) {
        try {
          const runtime = await this.commands.runtime(id);
          if (runtime) this.consider(runtime.state);
        } catch (error) {
          this.logger.warn(`Engine turn check for ${id} failed: ${describe(error)}`);
        }
      }
    } catch (error) {
      // The pass repeats every few seconds; report a persisting failure once.
      const message = describe(error);
      if (message !== this.repairFailure) this.logger.warn(`Engine turn repair failed: ${message}`);
      if (periodic) this.repairFailure = message;
    } finally {
      if (periodic) this.repairing = false;
    }
  }

  /** Decides from committed state whether a new search is due. Never blocks. */
  consider(state: GameState) {
    if (state.mode !== 'engine') return;
    const color = engineColorOf(state);
    const current = this.turns.get(state.id);
    const due = !!color && state.status === 'active' && state.facts.turn === color;
    if (current && !current.settled) {
      if (current.ref.revision === state.revision && due) return; // duplicate scheduling
      // The in-flight search answers an older state. Only one search per
      // game: the next one starts once this one settles.
      current.obsolete = true;
      if (due) this.deferred.set(state.id, state);
      return;
    }
    if (!due) {
      this.turns.delete(state.id);
      this.deferred.delete(state.id);
      return;
    }
    // A settled turn at this revision (no time left to search) is not repeated.
    if (current?.ref.revision === state.revision) return;
    const turn: Turn = {
      ref: { gameId: state.id, revision: state.revision, color: color! },
      fen: state.fen,
      deadline: deadlineOf(state.clock, color!),
      phase: 'queued',
      attempt: 1,
      since: this.clock.now(),
      obsolete: false,
      settled: false,
    };
    this.turns.set(state.id, turn);
    void this.run(turn).catch((error: unknown) => {
      this.logger.error(`Engine turn for ${state.id} failed unexpectedly: ${describe(error)}`);
      this.settle(turn);
    });
  }

  private budget(turn: Turn) {
    return engineSearchBudget(turn.deadline - this.clock.now(), this.policy);
  }

  private async run(turn: Turn) {
    const label = `game ${turn.ref.gameId} r${turn.ref.revision}`;
    this.publish(turn);
    const outcome = await this.engines.findMove({
      fen: turn.fen,
      budget: () => this.budget(turn),
      signal: this.shutdown.signal,
      label,
      onProgress: (progress) => this.progress(turn, progress),
    });
    const ctx = { receivedAt: this.clock.now(), receivedPerf: performance.now() };
    if (turn.obsolete || this.shutdown.signal.aborted) {
      if (turn.obsolete) this.logger.log(`${label}: discarded a reply for an obsolete turn`);
      return this.settle(turn);
    }
    if (!outcome.ok) return this.failed(turn, outcome.error, label);
    const { bestMove } = outcome.result;
    if (bestMove === null) {
      // "null if terminal": our own rules decide whether the position is terminal.
      const terminal = Object.keys(positionFacts(turn.fen).legalMoves).length === 0;
      this.logger.error(`${label}: engine reported no move in a ${terminal ? 'terminal' : 'non-terminal'} position`);
      if (terminal) return this.settle(turn);
      return this.abort(turn, label, 'no move in a position with legal moves');
    }
    for (let attempt = 0; ; attempt += 1) {
      const result = await this.commands.applyEngineMove(turn.ref, bestMove, attempt === 0 ? ctx : this.now());
      // An earlier attempt may have committed without its reply; publish what is committed.
      if (attempt > 0 && result.status === 'stale') await this.commands.republish(turn.ref.gameId);
      if (result.status !== 'unavailable') return this.applied(turn, result, bestMove, label);
      const delay = APPLY_RETRY_DELAYS_MS[attempt];
      if (delay === undefined || turn.obsolete) {
        // Nothing was published; the repair pass schedules the same turn again.
        this.logger.warn(`${label}: could not save the engine move; will reschedule`);
        return this.settle(turn);
      }
      await new Promise((resolve) => setTimeout(resolve, delay).unref());
    }
  }

  private applied(turn: Turn, result: EngineApplyResult, uci: string, label: string) {
    switch (result.status) {
      case 'applied':
      case 'stale':
      case 'timeout':
        if (result.status !== 'applied') this.logger.log(`${label}: reply ${uci} not applied (${result.status})`);
        return this.settle(turn);
      case 'illegal':
        this.logger.error(`${label}: engine move ${uci} rejected (${result.reason})`);
        return this.abort(turn, label, `illegal move ${uci}`);
      default:
        return this.settle(turn);
    }
  }

  /**
   * A search that could not produce a move. If the engine's own clock left no
   * room (no time to request, or a deadline set by the clock), the clock
   * decides through normal timeout adjudication. Any other failure after the
   * bounded attempts aborts the game. A cancelled search (shutdown) changes
   * nothing; the next startup reschedules it.
   */
  private failed(turn: Turn, error: EngineError, label: string) {
    if (error.kind === 'cancelled') return this.settle(turn);
    const clockBound = error.kind === 'no_time' || (error.kind === 'deadline_exceeded' && this.budget(turn) === null);
    if (clockBound) {
      this.logger.log(`${label}: engine clock exhausted (${error.kind}); timeout adjudication decides`);
      // Kept as a marker so this revision is not searched again; the clock timer ends the game.
      return this.settle(turn, { keep: true });
    }
    return this.abort(turn, label, `${error.kind}: ${error.message}`);
  }

  /** If the abort cannot be saved, the turn is forgotten and the repair pass tries again. */
  private async abort(turn: Turn, label: string, reason: string) {
    this.logger.warn(`${label}: aborting engine game after engine failure (${reason})`);
    await this.commands.abortForEngineFailure(turn.ref, this.clock.now());
    this.settle(turn);
  }

  private progress(turn: Turn, progress: SearchProgress) {
    if (turn.obsolete || turn.settled) return;
    turn.phase = progress.phase;
    turn.attempt = progress.attempt;
    turn.since = this.clock.now();
    this.publish(turn);
  }

  /**
   * Ends a turn and forgets it, so committed state alone decides what comes
   * next: a later commit, the repair pass or a deferred state. `keep` leaves
   * it as a marker that this revision gets no further search.
   */
  private settle(turn: Turn, options: { keep?: boolean } = {}) {
    if (turn.settled) return;
    turn.settled = true;
    const id = turn.ref.gameId;
    const current = this.turns.get(id) === turn;
    if (current && !options.keep) this.turns.delete(id);
    this.publish(turn);
    if (current && this.deferred.delete(id)) {
      this.turns.delete(id);
      void this.recover([id]);
    }
  }

  private now() {
    return { receivedAt: this.clock.now(), receivedPerf: performance.now() };
  }

  /**
   * Engine progress is not game state: it never changes the revision.
   * Publishes for a game are chained so subscribers receive phases in the
   * order they happened (each publish awaits the socket lookup).
   */
  private publish(turn: Turn) {
    const { gameId, revision } = turn.ref;
    const view = this.view(gameId);
    const payload = { id: gameId, revision, engineTurn: view && view.revision === revision ? view : null };
    const previous = this.publishing.get(gameId) ?? Promise.resolve();
    const next = previous.then(() =>
      this.publisher.toChannelViewers(gameChannel(gameId), 'game.engine', () => payload),
    );
    this.publishing.set(gameId, next);
    void next.finally(() => {
      if (this.publishing.get(gameId) === next) this.publishing.delete(gameId);
    });
  }
}

/** One readable line. Prisma messages start with a blank line; its error code says the most. */
function describe(error: unknown) {
  if (!(error instanceof Error)) return 'unknown';
  const line = error.message.split('\n').map((l) => l.trim()).find(Boolean) ?? error.name;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? `${code}: ${line}` : line;
}
