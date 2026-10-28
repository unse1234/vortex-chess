"use client";

import { Suspense, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import type { AudioCue } from "./audio-assets";
import { AudioManager } from "./audio-manager";
import { AudioPreferencesStore, defaultAudioPreferences, type AudioPreferences } from "./audio-preferences";

type AudioControls = {
  preferences: AudioPreferences;
  ready: boolean;
  unlocked: boolean;
  enable: () => Promise<void>;
  updatePreferences: (patch: Partial<AudioPreferences>) => void;
  play: (cue: AudioCue) => void;
  playOnce: (cue: AudioCue, eventId: string, continueOnPath?: string) => void;
  stopGame: () => void;
};
const AudioContext = createContext<AudioControls | null>(null);

export function AudioProvider({ children }: { children: ReactNode }) {
  const manager = useRef<AudioManager | null>(null);
  const store = useMemo(() => new AudioPreferencesStore(), []);
  const saved = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const preferences = saved ?? defaultAudioPreferences;
  const ready = saved !== null;
  const [unlocked, setUnlocked] = useState(false);
  const optedIn = useRef(false);

  useEffect(() => {
    const instance = new AudioManager();
    instance.setPreferences(store.hydrate());
    manager.current = instance;
    const hide = () => {
      instance.suspend();
      setUnlocked(false);
    };
    const visibility = () => { if (document.visibilityState !== "visible") hide(); };
    const interact = (event: Event) => {
      if (optedIn.current && event.isTrusted && document.visibilityState === "visible" && !instance.isRunning())
        void instance.unlock().then((enabled) => { if (manager.current === instance) setUnlocked(enabled); });
    };
    // Previously opted-in tabs can recover on a fresh gesture, never by replaying blocked cues.
    document.addEventListener("visibilitychange", visibility);
    document.addEventListener("pointerdown", interact);
    document.addEventListener("keydown", interact);
    window.addEventListener("pagehide", hide);
    return () => {
      manager.current = null;
      document.removeEventListener("visibilitychange", visibility);
      document.removeEventListener("pointerdown", interact);
      document.removeEventListener("keydown", interact);
      window.removeEventListener("pagehide", hide);
      instance.dispose();
    };
  }, [store]);

  const navigate = useCallback((pathname: string) => manager.current?.navigate(pathname), []);

  const enable = useCallback(async () => {
    optedIn.current = true;
    const instance = manager.current;
    const enabled = await instance?.unlock() ?? false;
    if (instance === manager.current) setUnlocked(enabled);
  }, []);
  const updatePreferences = useCallback((patch: Partial<AudioPreferences>) => {
    manager.current?.setPreferences(store.update(patch));
  }, [store]);
  const play = useCallback((cue: AudioCue) => manager.current?.play(cue), []);
  const playOnce = useCallback((cue: AudioCue, eventId: string, continueOnPath?: string) => manager.current?.playOnce(cue, eventId, continueOnPath), []);
  const stopGame = useCallback(() => manager.current?.stop("game"), []);
  const value = useMemo(() => ({ preferences, ready, unlocked, enable, updatePreferences, play, playOnce, stopGame }),
    [preferences, ready, unlocked, enable, updatePreferences, play, playOnce, stopGame]);
  return (
    <AudioContext.Provider value={value}>
      <Suspense fallback={null}><AudioNavigation onNavigate={navigate} /></Suspense>
      {children}
    </AudioContext.Provider>
  );
}

/** URL-dependent work streams independently so the provider can prerender with Cache Components. */
function AudioNavigation({ onNavigate }: { onNavigate: (pathname: string) => void }) {
  const pathname = usePathname();
  useEffect(() => { onNavigate(pathname); }, [pathname, onNavigate]);
  return null;
}

export function useAudio() {
  const value = useContext(AudioContext);
  if (!value) throw new Error("useAudio requires AudioProvider");
  return value;
}
