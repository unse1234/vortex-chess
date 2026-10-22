import { describe, expect, it } from "vitest";
import { formatMovetext, toMoveRows } from "@/features/games/pgn";
import { summarizeResult } from "@/features/games/result-text";
import type { GameMove, GameResult, ViewerPermissions } from "@/features/games/types/game.types";

const move = (ply: number, san: string): GameMove => ({ ply, san, from: "e2", to: "e4", annotation: null });

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
  const spectator: ViewerPermissions = {
    role: "spectator",
    color: null,
    canMove: false,
    canResign: false,
    canOfferDraw: false,
    canRespondToDraw: false,
  };
  const whiteResigned: GameResult = { outcome: "black", reason: "resignation", ratingChange: { w: -12, b: 12 } };

  it("words the result from the viewer's side", () => {
    expect(summarizeResult(whiteResigned, player("w"))).toMatchObject({ headline: "Defeat", tone: "loss", ratingChange: -12 });
    expect(summarizeResult(whiteResigned, player("b"))).toMatchObject({ headline: "Victory", tone: "win", ratingChange: 12 });
  });

  it("names the winner for spectators and shows no rating change", () => {
    expect(summarizeResult(whiteResigned, spectator)).toMatchObject({
      headline: "Black wins",
      ratingChange: null,
    });
  });

  it("handles draws and pending rating calculations", () => {
    const draw: GameResult = { outcome: "draw", reason: "agreement", ratingChange: null };
    expect(summarizeResult(draw, player("w"))).toMatchObject({ headline: "Draw", tone: "neutral", ratingChange: null });
    expect(summarizeResult({ ...whiteResigned, ratingChange: null }, player("w")).ratingChange).toBeNull();
  });
});
