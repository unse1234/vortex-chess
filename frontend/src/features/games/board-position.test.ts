import { describe, expect, it } from "vitest";
import {
  getOccupiedSquares,
  getPieceAt,
  isPromotionMove,
  parseCoordinateMove,
  previewMove,
  capturedByColor,
} from "@/features/games/board-position";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("board position helpers", () => {
  it("reads pieces and occupancy from the FEN placement", () => {
    expect(getPieceAt(START, "e1")).toBe("K");
    expect(getPieceAt(START, "d8")).toBe("q");
    expect(getPieceAt(START, "e4")).toBeNull();
    expect(getOccupiedSquares(START).size).toBe(32);
  });

  it("handles runs of empty squares", () => {
    const fen = "8/2P5/4k3/8/8/8/8/4K3 w - - 0 70";
    expect(getPieceAt(fen, "c7")).toBe("P");
    expect(getPieceAt(fen, "e6")).toBe("k");
    expect(getOccupiedSquares(fen).size).toBe(3);
  });

  it("recognises promotions only for pawns reaching the far rank", () => {
    const fen = "8/2P5/4k3/8/8/8/8/4K3 w - - 0 70";
    expect(isPromotionMove(fen, "c7", "c8")).toBe(true);
    expect(isPromotionMove(fen, "e1", "e2")).toBe(false);
    expect(isPromotionMove(START, "e2", "e4")).toBe(false);
    // Black pawns promote on rank 1.
    expect(isPromotionMove("4k3/8/8/8/8/8/p7/4K3 b - - 0 1", "a2", "a1")).toBe(true);
  });
});

describe("parseCoordinateMove", () => {
  it("accepts plain, spaced and promotion forms", () => {
    expect(parseCoordinateMove("e2e4")).toEqual({ from: "e2", to: "e4", promotion: undefined });
    expect(parseCoordinateMove(" E2 - E4 ")).toEqual({ from: "e2", to: "e4", promotion: undefined });
    expect(parseCoordinateMove("e7e8Q")).toEqual({ from: "e7", to: "e8", promotion: "q" });
  });

  it("rejects anything else", () => {
    for (const input of ["", "e2", "e2e9", "i2i4", "e7e8k", "castle"]) {
      expect(parseCoordinateMove(input)).toBeNull();
    }
  });
});

describe("provisional move preview", () => {
  it("moves the piece and leaves the rest of the FEN untouched", () => {
    expect(previewMove(START, "e2", "e4")).toBe("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1");
  });

  it("shows castling, en passant and promotion as the player intends", () => {
    const castle = "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1";
    expect(previewMove(castle, "e1", "g1").split(" ")[0]).toBe("r3k2r/8/8/8/8/8/8/R4RK1");
    expect(previewMove(castle, "e1", "c1").split(" ")[0]).toBe("r3k2r/8/8/8/8/8/8/2KR3R");
    const ep = "rnbqkbnr/1pp1pppp/p7/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3";
    expect(previewMove(ep, "e5", "d6").split(" ")[0]).toBe("rnbqkbnr/1pp1pppp/p2P4/8/8/8/PPPP1PPP/RNBQKBNR");
    expect(previewMove("8/2P5/4k3/8/8/8/8/4K3 w - - 0 70", "c7", "c8", "n").split(" ")[0]).toBe("2N5/8/4k3/8/8/8/8/4K3");
  });

  it("collects captures per capturing colour", () => {
    expect(
      capturedByColor([
        { color: "w", captured: null },
        { color: "b", captured: "p" },
        { color: "w", captured: "q" },
      ]),
    ).toEqual({ w: ["q"], b: ["p"] });
  });
});
