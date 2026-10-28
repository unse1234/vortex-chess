"use client";

import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Popover } from "@/components/ui/popover";
import { useAudio } from "@/features/audio/audio-provider";

export function AudioSettings() {
  const { preferences, ready, unlocked, enable, updatePreferences, play } = useAudio();
  const volumeId = useId();
  return (
    <Popover label="Audio settings" panelClassName="max-sm:fixed max-sm:left-4 max-sm:right-4 max-sm:top-16 max-sm:mt-0 max-sm:w-auto" trigger={(props) => (
      <button {...props} type="button" aria-label="Audio settings" className="inline-flex items-center gap-2 rounded-md bg-surface-raised px-2 py-2 text-sm text-auth-label hover:text-auth-text sm:px-3">
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 5 6 9H3v6h3l5 4V5Z" />
          {preferences.muted || !preferences.effects || preferences.volume === 0
            ? <path d="m16 9 6 6m0-6-6 6" />
            : <path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" />}
        </svg>
        <span className="hidden sm:inline">Audio</span>
      </button>
    )}>
      <h2 className="font-display text-lg text-auth-text">Game audio</h2>
      <p className="mt-1 text-xs text-auth-label" aria-live="polite">
        {unlocked ? "Audio enabled for this tab." : "Enable audio to hear new events. After returning to this tab, interact to resume."}
      </p>
      <fieldset disabled={!ready} className="mt-4 space-y-4 text-sm text-auth-text">
        <label className="flex items-center justify-between gap-3">
          Master mute
          <input type="checkbox" checked={preferences.muted} onChange={(e) => updatePreferences({ muted: e.target.checked })} className="size-4 accent-auth-primary" />
        </label>
        <label className="flex items-center justify-between gap-3">
          Sound effects
          <input type="checkbox" checked={preferences.effects} onChange={(e) => updatePreferences({ effects: e.target.checked })} className="size-4 accent-auth-primary" />
        </label>
        <div>
          <label htmlFor={volumeId} className="flex justify-between">Volume <span>{Math.round(preferences.volume * 100)}%</span></label>
          <input id={volumeId} type="range" min="0" max="100" value={Math.round(preferences.volume * 100)} onChange={(e) => updatePreferences({ volume: Number(e.target.value) / 100 })} className="mt-2 w-full accent-auth-primary" />
        </div>
        <Button variant="ghost" onClick={() => { void enable().then(() => play("moveSelf")); }}>
          {unlocked ? "Test sound" : "Enable audio"}
        </Button>
      </fieldset>
    </Popover>
  );
}
