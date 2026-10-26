import type {
  AnalysisPath,
  PreviewResponse,
} from "@/features/games/types/analysis.types";
import type { GameSnapshot } from "@/features/games/types/game.types";

export type VariationNode = AnalysisPath & {
  id: string;
  parentId: string;
  uci: string;
  san: string;
  fen: string;
  ply: number;
};
export type VariationTree = Record<string, VariationNode>;
export type PreferredChildren = Record<string, string>;
export const mainlineId = (ply: number) => `main:${ply}`;
export const originalPly = (id: string) =>
  id.startsWith("main:") ? Number(id.slice(5)) : null;

export function pathFor(tree: VariationTree, id: string): AnalysisPath {
  const ply = originalPly(id);
  return ply === null
    ? { basePly: tree[id].basePly, path: tree[id].path }
    : { basePly: ply, path: [] };
}

/** Identity follows the parent and move, never the resulting FEN. */
export function existingChild(
  game: GameSnapshot,
  tree: VariationTree,
  parentId: string,
  uci: string,
) {
  const ply = originalPly(parentId);
  if (ply !== null && game.moves[ply]?.uci === uci) return mainlineId(ply + 1);
  return Object.values(tree).find(
    (node) => node.parentId === parentId && node.uci === uci,
  )?.id;
}

export function addVariation(
  tree: VariationTree,
  parentId: string,
  id: string,
  input: AnalysisPath,
  result: PreviewResponse,
): VariationTree {
  const move = result.moves.at(-1)!;
  return { ...tree, [id]: { ...input, id, parentId, ...move } };
}

export function nextNode(
  game: GameSnapshot,
  tree: VariationTree,
  preferred: PreferredChildren,
  id: string,
): string | undefined {
  if (preferred[id]) return preferred[id];
  const ply = originalPly(id);
  if (ply !== null && ply < game.ply) return mainlineId(ply + 1);
  return Object.values(tree).find((node) => node.parentId === id)?.id;
}

/** Cancels and invalidates even when the transport delivers an aborted response. */
export class PreviewGate {
  private epoch = 0;
  private controller?: AbortController;
  cancel() {
    this.epoch++;
    this.controller?.abort();
  }
  begin() {
    this.cancel();
    const epoch = this.epoch;
    this.controller = new AbortController();
    return {
      signal: this.controller.signal,
      current: () => epoch === this.epoch,
    };
  }
}
