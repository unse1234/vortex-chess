"use client";

import { useLayoutEffect, useMemo } from "react";
import { useAudio } from "@/features/audio/audio-provider";
import { LiveGameAudio } from "@/features/games/audio/game-audio";
import type { GameSnapshot, GameUpdate } from "@/features/games/types/game.types";

/** Composes audio with game lifecycle without making either feature depend on its sibling. */
export function useGameAudio(gameId: string) {
  const { playOnce, stopGame } = useAudio();
  const events = useMemo(() => {
    const audio = new LiveGameAudio(gameId, playOnce);
    const lifecycle = { active: true };
    return {
      mount: () => { lifecycle.active = true; },
      discardBefore: () => audio.discardBefore(),
      onSynchronization: (snapshot: GameSnapshot) => { if (lifecycle.active) audio.sync(snapshot); },
      onLiveUpdate: (current: GameSnapshot, update: GameUpdate, audible: boolean) => {
        if (lifecycle.active) audio.accepted(current, update, audible);
      },
      onLivePause: () => { audio.pause(); stopGame(); },
      unmount: () => { lifecycle.active = false; audio.pause(); stopGame(); },
    };
  }, [gameId, playOnce, stopGame]);
  useLayoutEffect(() => {
    events.mount();
    document.addEventListener("visibilitychange", events.discardBefore);
    return () => {
      document.removeEventListener("visibilitychange", events.discardBefore);
      events.unmount();
    };
  }, [events]);
  return events;
}
