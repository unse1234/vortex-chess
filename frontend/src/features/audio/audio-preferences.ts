export const AUDIO_STORAGE_KEY = "vortix.audio.v1";
export type AudioPreferences = { muted: boolean; volume: number; effects: boolean };
export const defaultAudioPreferences: AudioPreferences = { muted: false, volume: 0.65, effects: true };

/** Ignore unknown keys and malformed fields, including preferences from other versions. */
export function parseAudioPreferences(raw: string | null): AudioPreferences {
  try {
    const value: unknown = raw ? JSON.parse(raw) : null;
    if (!value || typeof value !== "object") return { ...defaultAudioPreferences };
    const p = value as Partial<AudioPreferences>;
    return {
      muted: typeof p.muted === "boolean" ? p.muted : defaultAudioPreferences.muted,
      effects: typeof p.effects === "boolean" ? p.effects : defaultAudioPreferences.effects,
      volume: typeof p.volume === "number" && Number.isFinite(p.volume)
        ? Math.max(0, Math.min(1, p.volume)) : defaultAudioPreferences.volume,
    };
  } catch {
    return { ...defaultAudioPreferences };
  }
}

/** Per-provider external preference store: SSR stays unhydrated and silent. */
export class AudioPreferencesStore {
  private value: AudioPreferences | null = null;
  private listeners = new Set<() => void>();
  getSnapshot = () => this.value;
  getServerSnapshot = () => null;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  hydrate() {
    try { this.value = parseAudioPreferences(localStorage.getItem(AUDIO_STORAGE_KEY)); }
    catch { this.value = { ...defaultAudioPreferences }; }
    this.listeners.forEach((listener) => listener());
    return this.value;
  }
  update(patch: Partial<AudioPreferences>) {
    this.value = parseAudioPreferences(JSON.stringify({ ...(this.value ?? defaultAudioPreferences), ...patch }));
    try { localStorage.setItem(AUDIO_STORAGE_KEY, JSON.stringify(this.value)); } catch { /* In-memory preferences still work. */ }
    this.listeners.forEach((listener) => listener());
    return this.value;
  }
}
