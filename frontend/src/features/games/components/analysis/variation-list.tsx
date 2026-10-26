import {
  mainlineId,
  type VariationNode,
  type VariationTree,
} from "@/features/games/analysis-tree";
import type { GameSnapshot } from "@/features/games/types/game.types";
import { cn } from "@/utils/cn";

function notation(fen: string, san: string) {
  const fields = fen.split(" ");
  return `${fields[5]}${fields[1] === "w" ? "." : "..."} ${san}`;
}
const moveClass =
  "rounded px-2 py-1 text-left font-mono text-sm hover:bg-surface-hover";

function Branches({
  parent,
  childrenByParent,
  cursor,
  select,
}: {
  parent: string;
  childrenByParent: Map<string, VariationNode[]>;
  cursor: string;
  select: (id: string) => void;
}) {
  const children = childrenByParent.get(parent);
  if (!children) return null;
  return (
    <ol className="ml-3 border-l border-auth-amber/40 pl-2">
      {children.map((node) => {
        const fields = node.fen.split(" ");
        const mover = fields[1] === "w" ? "b" : "w";
        const moveNumber = Number(fields[5]) - (mover === "b" ? 1 : 0);
        return (
          <li key={node.id}>
            <button
              className={cn(
                moveClass,
                "text-auth-amber",
                cursor === node.id && "bg-surface-hover ring-1 ring-auth-amber",
              )}
              aria-current={cursor === node.id ? "step" : undefined}
              onClick={() => select(node.id)}
            >
              {moveNumber}
              {mover === "w" ? "." : "..."} {node.san}{" "}
              <span className="text-xs">temporary</span>
            </button>
            <Branches
              parent={node.id}
              childrenByParent={childrenByParent}
              cursor={cursor}
              select={select}
            />
          </li>
        );
      })}
    </ol>
  );
}

export function VariationList({
  game,
  tree,
  cursor,
  select,
}: {
  game: GameSnapshot;
  tree: VariationTree;
  cursor: string;
  select: (id: string) => void;
}) {
  const childrenByParent = new Map<string, VariationNode[]>();
  for (const node of Object.values(tree))
    childrenByParent.set(node.parentId, [
      ...(childrenByParent.get(node.parentId) ?? []),
      node,
    ]);
  return (
    <section
      className="min-h-24 flex-1 overflow-auto"
      aria-label="Recorded moves and temporary variations"
    >
      <h2 className="mb-2 font-display text-lg">Recorded mainline</h2>
      <ol>
        <li>
          <button
            className={cn(
              moveClass,
              cursor === mainlineId(0) && "bg-surface-hover text-auth-primary",
            )}
            onClick={() => select(mainlineId(0))}
            aria-current={cursor === mainlineId(0) ? "step" : undefined}
          >
            Initial position
          </button>
          <Branches
            parent={mainlineId(0)}
            {...{ childrenByParent, cursor, select }}
          />
        </li>
        {game.moves.map((move, i) => (
          <li key={move.ply}>
            <button
              className={cn(
                moveClass,
                cursor === mainlineId(move.ply) &&
                  "bg-surface-hover text-auth-primary",
              )}
              onClick={() => select(mainlineId(move.ply))}
              aria-current={
                cursor === mainlineId(move.ply) ? "step" : undefined
              }
            >
              {notation(
                i === 0 ? game.initialFen : game.moves[i - 1].fen,
                move.san,
              )}
            </button>
            <Branches
              parent={mainlineId(move.ply)}
              {...{ childrenByParent, cursor, select }}
            />
          </li>
        ))}
      </ol>
    </section>
  );
}
