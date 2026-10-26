"use client";

import { useEffect, useRef, useState } from "react";
import { useMediaQuery } from "@/hooks/use-media-query";

type BoardFitOptions = {
  /** Width reserved beside the board on wide screens (side column + gap). */
  sideWidth: number;
  /** Space the board frame adds around the board on each axis. */
  framePadding: number;
  /** Height of the status line under the board, inside the frame. */
  statusHeight: number;
  /** Largest board edge, in CSS pixels. */
  maxSize: number;
};

const WIDE_QUERY = "(min-width: 1280px)";

/**
 * Largest square board that fits the arena. On wide screens the board must
 * fit both the width left beside the side column and the arena's height;
 * below that it simply takes the content width.
 *
 * Only the arena itself is measured, and its size never depends on the board
 * (it is a flex-1, min-h-0 region), so sizing the board cannot feed back into
 * the measurement.
 */
export function useBoardFit({ sideWidth, framePadding, statusHeight, maxSize }: BoardFitOptions) {
  const areaRef = useRef<HTMLElement>(null);
  const wide = useMediaQuery(WIDE_QUERY);
  const [area, setArea] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = areaRef.current;
    if (!element) return;
    // Whole pixels, and no update when nothing changed: sub-pixel jitter
    // would otherwise re-render on every frame of a resize.
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.floor(entry.contentRect.width);
      const height = Math.floor(entry.contentRect.height);
      setArea((current) => (current.width === width && current.height === height ? current : { width, height }));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  if (area.width === 0) return { areaRef, wide, boardSize: null, frameHeight: null };
  const byWidth = (wide ? area.width - sideWidth : area.width) - 2 * framePadding;
  const byHeight = wide ? area.height - 2 * framePadding - statusHeight : Number.POSITIVE_INFINITY;
  const boardSize = Math.max(0, Math.floor(Math.min(byWidth, byHeight, maxSize)));
  return { areaRef, wide, boardSize, frameHeight: boardSize + 2 * framePadding + statusHeight };
}
