"use client";

import { useCallback, useLayoutEffect, useRef } from "react";
import { useAudio } from "@/features/audio/audio-provider";
import { routes } from "@/config/routes";

export function useGameStartAudio() {
  const { playOnce } = useAudio();
  const active = useRef(true);
  useLayoutEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  return useCallback((gameId: string) => {
    if (active.current) playOnce("gameStart", `start:${gameId}`, routes.game(gameId));
  }, [playOnce]);
}
