import { randomUUID } from 'node:crypto';
import { STANDARD_START_FEN } from '../../src/modules/games/rules/chess-rules';
import type {
  CommandRecord,
  LoadedGame,
} from '../../src/modules/games/services/game-repository';
import type { GameState, MoveRecord } from '../../src/modules/games/services/game-state';

/** In-memory doubles for unit tests of the game pipeline. Not part of the build. */
export const WHITE = '00000000-0000-4000-8000-00000000000a';
export const BLACK = '00000000-0000-4000-8000-00000000000b';
export const START = 1_800_000_000_000;

type Stored = { state: Omit<GameState, 'facts'>; moves: MoveRecord[]; commands: Map<string, { fingerprint: string; revision: number }> };

/** PostgreSQL stand-in with the same revision guard and unique keys, plus failure injection. */
export class MemoryRepository {
  games = new Map<string, Stored>();
  /** 'before' fails without writing; 'after' writes and then loses the reply. */
  failNext: 'before' | 'after' | null = null;
  hold: Promise<void> | null = null;
  writes = 0;

  seed(overrides: Partial<Omit<GameState, 'facts'>> = {}) {
    const id = randomUUID();
    this.games.set(id, {
      state: {
        id,
        roomId: null,
        mode: 'friends',
        players: { w: { kind: 'human', id: WHITE, username: 'White' }, b: { kind: 'human', id: BLACK, username: 'Black' } },
        initialFen: STANDARD_START_FEN,
        initialMs: 60_000,
        incrementMs: 2_000,
        startedAt: START,
        revision: 1,
        ply: 0,
        fen: STANDARD_START_FEN,
        status: 'active',
        clock: { remainingMs: { w: 60_000, b: 60_000 }, turnStartedAt: START },
        draw: { offerBy: null, declinedBy: null },
        outcome: null,
        endedAt: null,
        pgn: null,
        ...overrides,
      },
      moves: [],
      commands: new Map(),
    });
    return id;
  }

  /** An engine game: the engine plays `engineColor`, the account its opponent. */
  seedEngineGame(engineColor: 'w' | 'b', overrides: Partial<Omit<GameState, 'facts'>> = {}) {
    const engine = { kind: 'engine' as const, id: 'engine', username: 'scripted-engine' };
    const human = { kind: 'human' as const, id: engineColor === 'w' ? BLACK : WHITE, username: 'Player' };
    return this.seed({
      mode: 'engine',
      players: engineColor === 'w' ? { w: engine, b: human } : { w: human, b: engine },
      ...overrides,
    });
  }

  async activeEngineGameIds() {
    return [...this.games.values()]
      .filter((g) => g.state.mode === 'engine' && g.state.status === 'active')
      .map((g) => g.state.id);
  }

  /** Another writer (for example a restart's clock resumption) changed the game. */
  bumpRevision(id: string) {
    const stored = this.games.get(id)!;
    stored.state = { ...stored.state, revision: stored.state.revision + 1 };
  }

  async load(id: string): Promise<LoadedGame | null> {
    const stored = this.games.get(id);
    if (!stored) return null;
    return { state: structuredClone(stored.state), moves: structuredClone(stored.moves), commands: new Map(stored.commands) };
  }

  private async write(id: string, expectedRevision: number, apply: (stored: Stored) => void) {
    await this.hold;
    if (this.failNext === 'before') {
      this.failNext = null;
      throw new Error('connection refused');
    }
    const stored = this.games.get(id)!;
    if (stored.state.revision !== expectedRevision || stored.state.status !== 'active') return false;
    apply(stored);
    this.writes += 1;
    if (this.failNext === 'after') {
      this.failNext = null;
      throw new Error('connection lost before the reply');
    }
    return true;
  }

  private record(stored: Stored, command: CommandRecord | null, revision: number) {
    if (!command) return;
    const key = `${command.actorId}:${command.requestId}`;
    if (stored.commands.has(key)) throw new Error('unique violation: GameCommand_pkey');
    stored.commands.set(key, { fingerprint: command.fingerprint, revision });
  }

  commitMove(input: { expectedRevision: number; next: GameState; move: MoveRecord; command: CommandRecord | null }) {
    return this.write(input.next.id, input.expectedRevision, (stored) => {
      if (stored.moves.some((m) => m.ply === input.move.ply)) throw new Error('unique violation: GameMove_pkey');
      this.record(stored, input.command, input.next.revision);
      const { facts: _facts, ...state } = input.next;
      stored.state = structuredClone(state);
      stored.moves.push(structuredClone(input.move));
    });
  }

  commitChange(input: { expectedRevision: number; next: GameState; command: CommandRecord | null }) {
    return this.write(input.next.id, input.expectedRevision, (stored) => {
      this.record(stored, input.command, input.next.revision);
      const { facts: _facts, ...state } = input.next;
      stored.state = structuredClone(state);
    });
  }
}

export class FakeClock {
  value = START;
  now() {
    return this.value;
  }
}

