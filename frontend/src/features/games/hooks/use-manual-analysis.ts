"use client";

import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  addVariation,
  existingChild,
  mainlineId,
  originalPly,
  pathFor,
  PreviewGate,
  type VariationTree,
} from "@/features/games/analysis-tree";
import { previewAnalysis } from "@/features/games/services/analysis.service";
import type {
  AnalysisPath,
  PreviewResponse,
} from "@/features/games/types/analysis.types";
import type { GameSnapshot } from "@/features/games/types/game.types";

/** Mounted-workspace state only. No Query entry, storage or canonical-game writes. */
export function useManualAnalysis(game: GameSnapshot, enabled: boolean) {
  const [tree, setTree] = useState<VariationTree>({});
  const [preferred, setPreferred] = useState<Record<string, string>>({});
  const [cursor, setCursor] = useState(mainlineId(game.ply));
  const [validated, setValidated] = useState<{
    cursor: string;
    position: PreviewResponse;
  } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryVersion, setRetryVersion] = useState(0);
  const gate = useMemo(() => new PreviewGate(), []);
  // The mutation cache never receives a variation path or position: work is in
  // this closure and the mutation resolves void, with immediate garbage collection.
  const { mutate } = useMutation({
    mutationFn: (work: () => Promise<void>) => work(),
    gcTime: 0,
    retry: false,
  });
  useLayoutEffect(() => {
    const clear = () => {
      gate.cancel();
      // Next.js Cache Components may hide a visited route with React Activity
      // instead of unmounting it. Activity cleans up effects: clear state here
      // too, so a restored route cannot revive unsaved variations.
      setTree({});
      setPreferred({});
      setCursor(mainlineId(game.ply));
      setValidated(null);
      setPending(false);
      setError(null);
    };
    const restored = (event: PageTransitionEvent) => {
      if (event.persisted) clear();
    };
    // Full-document navigation may use the browser's own back/forward cache,
    // which preserves React without running component cleanup.
    window.addEventListener("pagehide", clear);
    window.addEventListener("pageshow", restored);
    return () => {
      window.removeEventListener("pagehide", clear);
      window.removeEventListener("pageshow", restored);
      clear();
    };
  }, [gate, game.id, game.ply]);

  const ply = originalPly(cursor);
  const fen =
    ply === null
      ? tree[cursor].fen
      : ply === 0
        ? game.initialFen
        : game.moves[ply - 1].fen;
  const input = useMemo(() => pathFor(tree, cursor), [tree, cursor]);

  useEffect(() => {
    if (!enabled || validated?.cursor === cursor) return;
    const request = gate.begin();
    mutate(async () => {
      try {
        const position = await previewAnalysis(game.id, input, request.signal);
        if (request.current()) setValidated({ cursor, position });
      } catch (failure) {
        if (request.current())
          setError(
            failure instanceof Error
              ? failure.message
              : "Couldn't load legal moves.",
          );
      }
    });
    return () => gate.cancel();
  }, [
    enabled,
    cursor,
    game.id,
    input,
    gate,
    mutate,
    validated?.cursor,
    retryVersion,
  ]);

  function select(id: string) {
    gate.cancel();
    setPending(false);
    setError(null);
    setCursor(id);
    // Remember the chosen continuation so Previous -> Next at a branch's
    // original base returns to that branch instead of silently changing lines.
    const continuations: Record<string, string> = {};
    let child = id;
    while (originalPly(child) === null) {
      const parent = tree[child].parentId;
      continuations[parent] = child;
      child = parent;
    }
    const original = originalPly(child)!;
    if (original > 0) continuations[mainlineId(original - 1)] = child;
    setPreferred((current) => ({ ...current, ...continuations }));
  }

  function play(uci: string) {
    if (!enabled || pending || validated?.cursor !== cursor) return false;
    const existing = existingChild(game, tree, cursor, uci);
    if (existing) {
      select(existing);
      return true;
    }
    if (Object.keys(tree).length >= 512 || input.path.length >= 128) {
      setError(
        "Variation limit reached. Return to an earlier position or discard variations.",
      );
      return false;
    }
    const proposed: AnalysisPath = {
      basePly: input.basePly,
      path: [...input.path, uci],
    };
    const request = gate.begin();
    setPending(true);
    setError(null);
    mutate(async () => {
      try {
        const position = await previewAnalysis(
          game.id,
          proposed,
          request.signal,
        );
        if (!request.current()) return;
        const id = `temp:${crypto.randomUUID()}`;
        setTree((current) =>
          addVariation(current, cursor, id, proposed, position),
        );
        setPreferred((current) => ({ ...current, [cursor]: id }));
        setValidated({ cursor: id, position });
        setCursor(id);
      } catch (failure) {
        if (request.current())
          setError(
            failure instanceof Error
              ? failure.message
              : "Couldn't validate this move.",
          );
      } finally {
        if (request.current()) setPending(false);
      }
    });
    return true;
  }

  function discard() {
    const base = pathFor(tree, cursor).basePly;
    gate.cancel();
    setTree({});
    setPreferred({});
    setValidated(null);
    setPending(false);
    setError(null);
    setCursor(mainlineId(base));
  }

  function returnToOriginal() {
    select(mainlineId(pathFor(tree, cursor).basePly));
    setPreferred({});
  }

  return {
    tree,
    preferred,
    cursor,
    fen,
    ply: ply ?? tree[cursor].ply,
    select,
    play,
    discard,
    returnToOriginal,
    pending,
    error,
    position: validated?.cursor === cursor ? validated.position : null,
    retry: () => {
      setError(null);
      setValidated(null);
      setRetryVersion((value) => value + 1);
    },
  };
}
