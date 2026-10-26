import { describe, it, expect } from "vitest";
import {
  addVariation,
  existingChild,
  nextNode,
  pathFor,
  PreviewGate,
  type VariationTree,
} from "@/features/games/analysis-tree";
import type { GameSnapshot } from "@/features/games/types/game.types";
import type { PreviewResponse } from "@/features/games/types/analysis.types";

const game = { moves: [{ uci: "e2e4" }] } as GameSnapshot;
const result = {
  moves: [{ uci: "d2d4", san: "d4", fen: "same-position", ply: 1 }],
} as PreviewResponse;
describe("temporary analysis tree", () => {
  it("keeps stable siblings and nested branches, reselects existing moves and never merges by FEN", () => {
    const empty: VariationTree = {};
    const first = addVariation(
      empty,
      "main:0",
      "a",
      { basePly: 0, path: ["d2d4"] },
      result,
    );
    const siblings = addVariation(
      first,
      "main:0",
      "b",
      { basePly: 0, path: ["c2c4"] },
      { ...result, moves: [{ ...result.moves[0], uci: "c2c4" }] },
    );
    const nested = addVariation(
      siblings,
      "a",
      "c",
      { basePly: 0, path: ["d2d4", "d7d5"] },
      { ...result, moves: [{ ...result.moves[0], uci: "d7d5" }] },
    );
    expect(existingChild(game, nested, "main:0", "d2d4")).toBe("a");
    expect(existingChild(game, nested, "main:0", "e2e4")).toBe("main:1");
    expect(existingChild(game, nested, "b", "d7d5")).toBeUndefined();
    expect(pathFor(nested, "c")).toEqual({
      basePly: 0,
      path: ["d2d4", "d7d5"],
    });
    expect(Object.keys(nested)).toEqual(["a", "b", "c"]);
    expect(empty).toEqual({});
    expect(
      nextNode(
        { ...game, ply: 1 },
        nested,
        { "main:0": "a", a: "c" },
        "main:0",
      ),
    ).toBe("a");
    expect(nextNode({ ...game, ply: 1 }, nested, {}, "main:0")).toBe("main:1");
    expect(nextNode({ ...game, ply: 1 }, nested, { a: "c" }, "a")).toBe("c");
  });
  it("invalidates late replies on navigation, reset, replacement and unmount, even if abort is ignored", async () => {
    const gate = new PreviewGate();
    const move = gate.begin();
    gate.cancel();
    expect(move.signal.aborted).toBe(true);
    expect(move.current()).toBe(false);
    const selection = gate.begin();
    const newer = gate.begin();
    expect(selection.current()).toBe(false);
    expect(newer.current()).toBe(true);
    gate.cancel();
    await Promise.resolve();
    expect(newer.current()).toBe(false);
  });
});
