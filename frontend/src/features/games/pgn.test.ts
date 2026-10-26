import { describe, expect, it } from "vitest";
import { formatMovetext, toMoveRows } from "@/features/games/pgn";
import { summarizeResult } from "@/features/games/result-text";
import type { GameMove, GameResult, ViewerPermissions } from "@/features/games/types/game.types";

const move = (ply: number, san: string): GameMove => ({
  ply,
  color: ply % 2 === 1 ? "w" : "b",
  san,
  uci: "e2e4",
  from: "e2",
  to: "e4",
  promotion: null,
  captured: null,
  fen: "8/8/8/8/8/8/8/8 w - - 0 1",
  remainingMs: { w: 0, b: 0 },
  elapsedMs: 0,
  playedAt: "2026-10-26T00:00:00.000Z",
  requestId: null,
});

describe("move rows and movetext", () => {
  const moves = [move(1, "d4"), move(2, "Nf6"), move(3, "c4"), move(4, "g6"), move(5, "Nc3")];

  it("pairs plies into numbered rows, leaving Black's cell empty on White's last move", () => {
    const rows = toMoveRows(moves);
    expect(rows.map((row) => row.number)).toEqual([1, 2, 3]);
    expect(rows[0].white?.san).toBe("d4");
    expect(rows[0].black?.san).toBe("Nf6");
    expect(rows[2].white?.san).toBe("Nc3");
    expect(rows[2].black).toBeNull();
  });

  it("formats PGN movetext from server notation", () => {
    expect(formatMovetext(moves)).toBe("1. d4 Nf6 2. c4 g6 3. Nc3");
    expect(formatMovetext([])).toBe("");
  });

  it("supports a position set up mid-game (first listed move is Black's)", () => {
    const rows = toMoveRows([move(140, "Kd5")]);
    expect(rows).toHaveLength(1);
    expect(rows[0].number).toBe(70);
    expect(rows[0].white).toBeNull();
    expect(rows[0].black?.san).toBe("Kd5");
  });
});

describe("summarizeResult", () => {
  const player = (color: "w" | "b"): ViewerPermissions => ({
    role: "player",
    color,
    canMove: false,
    canResign: false,
    canOfferDraw: false,
    canRespondToDraw: false,
  });
  const whiteResigned: GameResult = { outcome: "black", reason: "resignation" };

  it("speaks from the player's side", () => {
    expect(summarizeResult(whiteResigned, player("w"))).toMatchObject({ headline: "Defeat", tone: "loss", detail: "Black won by resignation." });
    expect(summarizeResult(whiteResigned, player("b"))).toMatchObject({ headline: "Victory", tone: "win", detail: "You won by resignation." });
  });

  it("names every automatic draw rule", () => {
    const draw = (reason: GameResult["reason"]) => summarizeResult({ outcome: "draw", reason }, player("w")).detail;
    expect(draw("threefold-repetition")).toBe("The game ended in a draw by threefold repetition.");
    expect(draw("fifty-move-rule")).toBe("The game ended in a draw by the fifty-move rule.");
    expect(draw("insufficient-material")).toBe("The game ended in a draw by insufficient material.");
    expect(draw("timeout-vs-insufficient-material")).toContain("time ran out");
  });
});
