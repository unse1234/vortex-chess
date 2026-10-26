import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { ServerClock } from '../clocks/server-clock';
import { GameRepository } from './game-repository';
import { reconstruct, type GameRuntime } from './game-state';
import { KeyedSerialQueue } from './keyed-serial-queue';

/** Finished games stay warm this long after their last read. */
const FINISHED_IDLE_MS = 5 * 60_000;
const SWEEP_MS = 60_000;

/**
 * Warm game state owned by this server, plus the per-game command lanes.
 * Active games stay in memory; a game that is not warm is rebuilt from its
 * persisted history on first use (single flight, so concurrent readers share
 * one load).
 */
@Injectable()
export class GameStore implements OnModuleDestroy {
  private readonly logger = new Logger(GameStore.name);
  readonly lanes = new KeyedSerialQueue();
  private readonly games = new Map<string, GameRuntime>();
  private readonly loading = new Map<string, Promise<GameRuntime | null>>();
  private readonly sweep: NodeJS.Timeout;

  constructor(
    private readonly repository: GameRepository,
    private readonly clock: ServerClock,
  ) {
    this.sweep = setInterval(() => this.evictIdle(), SWEEP_MS);
    this.sweep.unref();
  }

  onModuleDestroy() {
    clearInterval(this.sweep);
    for (const runtime of this.games.values()) clearTimeout(runtime.timer);
  }

  peek(gameId: string) {
    return this.games.get(gameId);
  }

  async get(gameId: string): Promise<GameRuntime | null> {
    const warm = this.games.get(gameId);
    if (warm) {
      warm.lastAccess = this.clock.now();
      return warm;
    }
    let pending = this.loading.get(gameId);
    if (!pending) {
      pending = this.load(gameId).finally(() => this.loading.delete(gameId));
      this.loading.set(gameId, pending);
    }
    return pending;
  }

  /**
   * Drops warm state whose relation to the database is uncertain (a failed
   * or ambiguous write). The next use reloads the committed truth.
   */
  evict(gameId: string) {
    const runtime = this.games.get(gameId);
    if (runtime) clearTimeout(runtime.timer);
    this.games.delete(gameId);
  }

  /** Warm games a user plays in. */
  forUser(userId: string) {
    return [...this.games.values()].filter(
      (r) => r.state.players.w.id === userId || r.state.players.b.id === userId,
    );
  }

  private async load(gameId: string) {
    const loaded = await this.repository.load(gameId);
    if (!loaded) return null;
    const runtime = reconstruct(
      loaded.state,
      loaded.moves,
      loaded.commands,
      this.clock.now(),
    );
    this.games.set(gameId, runtime);
    return runtime;
  }

  private evictIdle() {
    const cutoff = this.clock.now() - FINISHED_IDLE_MS;
    for (const [id, runtime] of this.games)
      if (runtime.state.status === 'finished' && runtime.lastAccess < cutoff)
        this.games.delete(id);
    this.logger.debug(`Warm games: ${this.games.size}`);
  }
}
