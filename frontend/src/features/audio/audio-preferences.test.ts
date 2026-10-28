import { afterEach, describe, expect, it, vi } from "vitest";
import { AUDIO_STORAGE_KEY, AudioPreferencesStore, defaultAudioPreferences, parseAudioPreferences } from "./audio-preferences";

afterEach(() => vi.unstubAllGlobals());

describe("audio preferences", () => {
  it("validates, clamps and removes unknown fields", () => {
    expect(parseAudioPreferences('{"muted":true,"volume":8,"effects":false,"voiceChat":true}'))
      .toEqual({ muted: true, volume: 1, effects: false });
    expect(parseAudioPreferences('{"volume":-3}').volume).toBe(0);
    for (const raw of [null, "bad", "null", "8", '{"muted":"yes","volume":"0","effects":1}'])
      expect(parseAudioPreferences(raw)).toEqual(defaultAudioPreferences);
  });
  it("hydrates before enabling playback and persists only preferences with a versioned key", () => {
    const storage = { getItem: vi.fn(() => '{"muted":true,"volume":0.25,"effects":false}'), setItem: vi.fn() };
    vi.stubGlobal("localStorage", storage);
    const store = new AudioPreferencesStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    expect(store.getServerSnapshot()).toBeNull();
    expect(store.getSnapshot()).toBeNull();
    expect(store.hydrate()).toEqual({ muted: true, volume: 0.25, effects: false });
    store.update({ volume: 0.5 });
    expect(storage.setItem).toHaveBeenCalledWith(AUDIO_STORAGE_KEY, '{"muted":true,"effects":false,"volume":0.5}');
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    store.update({ muted: false });
    expect(listener).toHaveBeenCalledTimes(2);
  });
  it("works with denied local storage", () => {
    vi.stubGlobal("localStorage", { getItem: () => { throw Error("denied"); }, setItem: () => { throw Error("denied"); } });
    const store = new AudioPreferencesStore();
    expect(store.hydrate()).toEqual(defaultAudioPreferences);
    expect(store.update({ muted: true }).muted).toBe(true);
  });
});
