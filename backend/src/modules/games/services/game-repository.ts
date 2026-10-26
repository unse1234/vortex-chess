import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import type {
  GameColor,
  GameCommandKind,
  GameResult,
  GameTermination,
  Prisma,
} from '../../../generated/prisma/client';
import type { Color, Outcome, Termination } from '../rules/chess-rules';
import { STANDARD_START_FEN } from '../rules/chess-rules';
import {
  ENGINE_PLAYER_ID,
  type AppliedCommand,
  type GameState,
  type MoveRecord,
  type PlayerInfo,
} from './game-state';

const toDbColor = (color: Color): GameColor => (color === 'w' ? 'WHITE' : 'BLACK');
const fromDbColor = (color: GameColor): Color => (color === 'WHITE' ? 'w' : 'b');

const TERMINATIONS: Record<Termination, GameTermination> = {
  checkmate: 'CHECKMATE',
  resignation: 'RESIGNATION',
  timeout: 'TIMEOUT',
  'timeout-vs-insufficient-material': 'TIMEOUT_VS_INSUFFICIENT_MATERIAL',
  stalemate: 'STALEMATE',
  'insufficient-material': 'INSUFFICIENT_MATERIAL',
  'threefold-repetition': 'THREEFOLD_REPETITION',
  'fifty-move-rule': 'FIFTY_MOVE_RULE',
  agreement: 'AGREEMENT',
  'engine-failure': 'ENGINE_FAILURE',
};
const fromDbTermination = Object.fromEntries(
  Object.entries(TERMINATIONS).map(([k, v]) => [v, k]),
) as Record<GameTermination, Termination>;

function toDbResult(outcome: Outcome): GameResult {
  if (outcome.termination === 'engine-failure') return 'ABORTED';
  if (!outcome.winner) return 'DRAW';
  return outcome.winner === 'w' ? 'WHITE_WINS' : 'BLACK_WINS';
}

const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());

export type CommandRecord = {
  actorId: string;
  requestId: string;
  kind: GameCommandKind;
  fingerprint: string;
};

export type NewGame = {
  roomId: string;
  whiteId: string;
  blackId: string;
  initialMs: number;
  incrementMs: number;
  startedAt: number;
};

export type NewEngineGame = {
  playerId: string;
  playerColor: Color;
  engineName: string;
  initialMs: number;
  incrementMs: number;
  startedAt: number;
};

export type LoadedGame = {
  state: Omit<GameState, 'facts'>;
  moves: MoveRecord[];
  commands: Map<string, AppliedCommand>;
};

/**
 * Persistence for games. Every change is one short statement guarded by the
 * revision the change was computed from, so a write based on stale state
 * changes nothing.
 */
@Injectable()
export class GameRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Inside the room-start transaction, under the room lock. */
  async createInTx(tx: Prisma.TransactionClient, input: NewGame) {
    const game = await tx.game.create({
      data: {
        roomId: input.roomId,
        initialFen: STANDARD_START_FEN,
        fen: STANDARD_START_FEN,
        initialMs: input.initialMs,
        incrementMs: input.incrementMs,
        whiteRemainingMs: input.initialMs,
        blackRemainingMs: input.initialMs,
        turnStartedAt: new Date(input.startedAt),
        startedAt: new Date(input.startedAt),
      },
      select: { id: true },
    });
    await tx.gameParticipant.createMany({
      data: [
        { gameId: game.id, color: 'WHITE', userId: input.whiteId },
        { gameId: game.id, color: 'BLACK', userId: input.blackId },
      ],
    });
    return game.id;
  }

  /**
   * Engine-game admission, inside the creation transaction. One account plays
   * one engine game at a time; the server admits at most `maxActive` in total.
   * An advisory lock makes the global count exact under concurrent creation.
   */
  async admitEngineGameInTx(tx: Prisma.TransactionClient, playerId: string, maxActive: number) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('vortix:engine-game-admission'))`;
    const own = await tx.game.findFirst({
      where: { mode: 'ENGINE', status: 'ACTIVE', participants: { some: { userId: playerId } } },
      select: { id: true },
    });
    if (own) return { admitted: false as const, reason: 'own_active' as const, gameId: own.id };
    const active = await tx.game.count({ where: { mode: 'ENGINE', status: 'ACTIVE' } });
    if (active >= maxActive) return { admitted: false as const, reason: 'capacity' as const };
    return { admitted: true as const };
  }

  /** One player seat and one engine seat; the clock of White starts at `startedAt`. */
  async createEngineGameInTx(tx: Prisma.TransactionClient, input: NewEngineGame) {
    const game = await tx.game.create({
      data: {
        mode: 'ENGINE',
        initialFen: STANDARD_START_FEN,
        fen: STANDARD_START_FEN,
        initialMs: input.initialMs,
        incrementMs: input.incrementMs,
        whiteRemainingMs: input.initialMs,
        blackRemainingMs: input.initialMs,
        turnStartedAt: new Date(input.startedAt),
        startedAt: new Date(input.startedAt),
      },
      select: { id: true },
    });
    const playerColor = toDbColor(input.playerColor);
    await tx.gameParticipant.createMany({
      data: [
        { gameId: game.id, color: playerColor, kind: 'PLAYER', userId: input.playerId },
        {
          gameId: game.id,
          color: playerColor === 'WHITE' ? 'BLACK' : 'WHITE',
          kind: 'ENGINE',
          engineName: input.engineName,
        },
      ],
    });
    return game.id;
  }

  /** Reads the game, its full move history and command ledger from one snapshot. */
  async load(gameId: string): Promise<LoadedGame | null> {
    return this.prisma.$transaction(
      async (tx) => {
        const game = await tx.game.findUnique({ where: { id: gameId } });
        if (!game) return null;
        const participants = await tx.gameParticipant.findMany({
          where: { gameId },
          select: {
            color: true,
            kind: true,
            engineName: true,
            user: { select: { id: true, username: true } },
          },
        });
        const moves = await tx.gameMove.findMany({
          where: { gameId },
          orderBy: { ply: 'asc' },
        });
        const commands = await tx.gameCommand.findMany({
          where: { gameId },
          select: { actorId: true, requestId: true, fingerprint: true, revision: true },
        });
        const seat = (color: 'WHITE' | 'BLACK'): PlayerInfo | null => {
          const p = participants.find((candidate) => candidate.color === color);
          if (p?.kind === 'ENGINE' && p.engineName)
            return { kind: 'engine', id: ENGINE_PLAYER_ID, username: p.engineName };
          if (p?.kind === 'PLAYER' && p.user) return { kind: 'human', ...p.user };
          return null;
        };
        const white = seat('WHITE');
        const black = seat('BLACK');
        if (!white || !black) return null;
        const outcome: Outcome | null =
          game.result && game.termination
            ? {
                winner:
                  game.result === 'WHITE_WINS' ? 'w' : game.result === 'BLACK_WINS' ? 'b' : null,
                termination: fromDbTermination[game.termination],
              }
            : null;
        return {
          state: {
            id: game.id,
            roomId: game.roomId,
            mode: game.mode === 'ENGINE' ? 'engine' : 'friends',
            players: { w: white, b: black },
            initialFen: game.initialFen,
            initialMs: game.initialMs,
            incrementMs: game.incrementMs,
            startedAt: game.startedAt.getTime(),
            revision: game.revision,
            ply: game.ply,
            fen: game.fen,
            status: game.status === 'ACTIVE' ? 'active' : 'finished',
            clock: {
              remainingMs: { w: game.whiteRemainingMs, b: game.blackRemainingMs },
              turnStartedAt: (game.turnStartedAt ?? game.endedAt ?? game.startedAt).getTime(),
            },
            draw: {
              offerBy: game.drawOfferBy ? fromDbColor(game.drawOfferBy) : null,
              declinedBy: game.drawDeclinedBy ? fromDbColor(game.drawDeclinedBy) : null,
            },
            outcome,
            endedAt: game.endedAt?.getTime() ?? null,
            pgn: game.pgn,
          },
          moves: moves.map((m) => ({
            ply: m.ply,
            color: fromDbColor(m.color),
            actorId: m.actorId,
            requestId: m.requestId,
            uci: m.uci,
            san: m.san,
            from: m.uci.slice(0, 2),
            to: m.uci.slice(2, 4),
            promotion: (m.uci[4] as MoveRecord['promotion']) ?? null,
            captured: (m.captured as MoveRecord['captured']) ?? null,
            fenAfter: m.fenAfter,
            playedAt: m.playedAt.getTime(),
            elapsedMs: m.elapsedMs,
            remainingMs: { w: m.whiteRemainingMs, b: m.blackRemainingMs },
          })),
          commands: new Map(
            commands.map((c) => [
              `${c.actorId}:${c.requestId}`,
              { fingerprint: c.fingerprint, revision: c.revision },
            ]),
          ),
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }

  private gameColumns(next: GameState) {
    const finished = next.status === 'finished';
    return {
      fen: next.fen,
      ply: next.ply,
      revision: next.revision,
      white: next.clock.remainingMs.w,
      black: next.clock.remainingMs.b,
      turnStartedAt: finished ? null : iso(next.clock.turnStartedAt),
      drawOfferBy: next.draw.offerBy ? toDbColor(next.draw.offerBy) : null,
      drawDeclinedBy: next.draw.declinedBy ? toDbColor(next.draw.declinedBy) : null,
      status: finished ? 'FINISHED' : 'ACTIVE',
      result: next.outcome ? toDbResult(next.outcome) : null,
      termination: next.outcome ? TERMINATIONS[next.outcome.termination] : null,
      endedAt: iso(next.endedAt),
      pgn: next.pgn,
    };
  }

  /**
   * Appends the move, records the command and advances the game in a single
   * statement: all three happen, or none do. Returns false when the game is
   * no longer at `expectedRevision`. Engine moves have no ledger entry: the
   * revision guard and the (game, ply) key make each engine turn apply once.
   */
  async commitMove(input: {
    expectedRevision: number;
    next: GameState;
    move: MoveRecord;
    command: CommandRecord | null;
  }) {
    const { next, move, command } = input;
    const g = this.gameColumns(next);
    const rows = await this.prisma.$queryRaw<{ updated: number }[]>`
      WITH g AS (
        UPDATE "Game" SET
          "fen" = ${g.fen}::varchar, "ply" = ${g.ply}::int, "revision" = ${g.revision}::int,
          "whiteRemainingMs" = ${g.white}::int, "blackRemainingMs" = ${g.black}::int,
          "turnStartedAt" = ${g.turnStartedAt}::timestamptz,
          "drawOfferBy" = ${g.drawOfferBy}::"GameColor", "drawDeclinedBy" = ${g.drawDeclinedBy}::"GameColor",
          "status" = ${g.status}::"GameStatus", "result" = ${g.result}::"GameResult",
          "termination" = ${g.termination}::"GameTermination", "endedAt" = ${g.endedAt}::timestamptz,
          "pgn" = ${g.pgn}::text, "updatedAt" = now()
        WHERE "id" = ${next.id}::uuid AND "revision" = ${input.expectedRevision}::int AND "status" = 'ACTIVE'
        RETURNING "id"
      ), m AS (
        INSERT INTO "GameMove" ("gameId", "ply", "color", "actorId", "requestId", "uci", "san", "captured",
          "fenAfter", "playedAt", "elapsedMs", "whiteRemainingMs", "blackRemainingMs")
        SELECT g."id", ${move.ply}::int, ${toDbColor(move.color)}::"GameColor", ${move.actorId}::uuid,
          ${move.requestId}::uuid, ${move.uci}::varchar, ${move.san}::varchar, ${move.captured}::char(1),
          ${move.fenAfter}::varchar, ${iso(move.playedAt)}::timestamptz, ${move.elapsedMs}::int,
          ${move.remainingMs.w}::int, ${move.remainingMs.b}::int
        FROM g RETURNING 1
      ), c AS (
        INSERT INTO "GameCommand" ("gameId", "actorId", "requestId", "kind", "fingerprint", "revision")
        SELECT g."id", ${command?.actorId ?? null}::uuid, ${command?.requestId ?? null}::uuid,
          ${command?.kind ?? null}::"GameCommandKind", ${command?.fingerprint ?? null}::varchar, ${g.revision}::int
        FROM g WHERE ${command !== null}::boolean RETURNING 1
      )
      SELECT (SELECT count(*) FROM g)::int AS "updated"`;
    return rows[0]?.updated === 1;
  }

  /**
   * Draw offers and answers, resignation, timeout and clock resumption: the
   * same revision-guarded update, with the command recorded when there is one.
   */
  async commitChange(input: {
    expectedRevision: number;
    next: GameState;
    command: CommandRecord | null;
  }) {
    const { next, command } = input;
    const g = this.gameColumns(next);
    const rows = await this.prisma.$queryRaw<{ updated: number }[]>`
      WITH g AS (
        UPDATE "Game" SET
          "revision" = ${g.revision}::int,
          "whiteRemainingMs" = ${g.white}::int, "blackRemainingMs" = ${g.black}::int,
          "turnStartedAt" = ${g.turnStartedAt}::timestamptz,
          "drawOfferBy" = ${g.drawOfferBy}::"GameColor", "drawDeclinedBy" = ${g.drawDeclinedBy}::"GameColor",
          "status" = ${g.status}::"GameStatus", "result" = ${g.result}::"GameResult",
          "termination" = ${g.termination}::"GameTermination", "endedAt" = ${g.endedAt}::timestamptz,
          "pgn" = ${g.pgn}::text, "updatedAt" = now()
        WHERE "id" = ${next.id}::uuid AND "revision" = ${input.expectedRevision}::int AND "status" = 'ACTIVE'
        RETURNING "id"
      ), c AS (
        INSERT INTO "GameCommand" ("gameId", "actorId", "requestId", "kind", "fingerprint", "revision")
        SELECT g."id", ${command?.actorId ?? null}::uuid, ${command?.requestId ?? null}::uuid,
          ${command?.kind ?? null}::"GameCommandKind", ${command?.fingerprint ?? null}::varchar, ${g.revision}::int
        FROM g WHERE ${command !== null}::boolean RETURNING 1
      )
      SELECT (SELECT count(*) FROM g)::int AS "updated"`;
    return rows[0]?.updated === 1;
  }

  /**
   * Restart policy: every active game's current turn restarts at `at` with
   * the time remaining at its last accepted move, so downtime is never
   * charged to a player. Returns the resumed game ids.
   */
  async resumeActive(at: number) {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      UPDATE "Game" SET "turnStartedAt" = ${iso(at)}::timestamptz,
        "revision" = "revision" + 1, "updatedAt" = now()
      WHERE "status" = 'ACTIVE'
      RETURNING "id"`;
    return rows.map((row) => row.id);
  }

  /** Active engine games, for repairing engine turns that were never scheduled. */
  async activeEngineGameIds() {
    const rows = await this.prisma.game.findMany({
      where: { mode: 'ENGINE', status: 'ACTIVE' },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }
}
