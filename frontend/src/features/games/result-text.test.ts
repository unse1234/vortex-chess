import { describe, expect, it } from "vitest";
import { describeBoardStatus } from "@/features/games/components/board/board-status";
import { summarizeResult } from "@/features/games/result-text";
import type { GameSnapshot, ViewerPermissions } from "@/features/games/types/game.types";

const viewer: ViewerPermissions = { role: "player", color: "b", canMove: false, canResign: true, canOfferDraw: false, canRespondToDraw: false };

function engineGame(overrides: Partial<GameSnapshot> = {}): GameSnapshot {
  return {
    id: "game-1",
    roomId: null,
    mode: "engine",
    engineTurn: null,
    revision: 3,
    ply: 2,
    timeControl: { category: "blitz", initialMs: 180_000, incrementMs: 0 },
    initialFen: "start",
    fen: "now",
    status: { phase: "in-progress", turn: "w" },
    players: {
      w: { id: "engine", username: "lightweight-chess-engine", avatarUrl: null, kind: "engine", online: true },
      b: { id: "me", username: "Me", avatarUrl: null, kind: "human", online: true },
    },
    clocks: { remainingMs: { w: 1000, b: 1000 }, runningSide: "w", serverTime: 0 },
    moves: [],
    lastMove: null,
    checkSquare: null,
    viewer,
    legalMoves: {},
    drawOffer: null,
    startedAt: "2026-10-26T10:00:00.000Z",
    endedAt: null,
    pgn: null,
    ...overrides,
  };
}

describe("engine game wording", () => {
  it("describes an aborted game as having no result, never as a win or a draw", () => {
    const summary = summarizeResult({ outcome: "aborted", reason: "engine-failure" }, viewer);
    expect(summary).toMatchObject({ headline: "Aborted", tone: "neutral" });
    expect(summary.detail).toContain("No result is recorded");
  });

  it("reports the engine's search phase from the server, for the current revision only", () => {
    expect(describeBoardStatus(engineGame(), "live", null, null).right).toContain("ENGINE THINKING");
    const retrying = engineGame({ engineTurn: { revision: 3, color: "w", phase: "retrying", attempt: 2, since: 0 } });
    expect(describeBoardStatus(retrying, "live", null, null)).toMatchObject({ right: "MOVE 2 // ENGINE UNREACHABLE // RETRY 2", tone: "warning" });
    const queued = engineGame({ engineTurn: { revision: 3, color: "w", phase: "queued", attempt: 1, since: 0 } });
    expect(describeBoardStatus(queued, "live", null, null).right).toContain("ENGINE QUEUED");
    const stale = engineGame({ engineTurn: { revision: 2, color: "w", phase: "retrying", attempt: 3, since: 0 } });
    expect(describeBoardStatus(stale, "live", null, null).right).toContain("ENGINE THINKING");
    const aborted = engineGame({ status: { phase: "finished", result: { outcome: "aborted", reason: "engine-failure" } } });
    expect(describeBoardStatus(aborted, "live", null, null).right).toBe("ABORTED // ENGINE FAILURE");
  });
});
