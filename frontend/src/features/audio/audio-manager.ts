import { audioAssets, type AudioChannel, type AudioCue } from "./audio-assets";
import { defaultAudioPreferences, type AudioPreferences } from "./audio-preferences";

const MAX_CUE_AGE_MS = 750;

/** One browser-owned context, cached decodes and replaceable effect channels; never queues cues. */
export class AudioManager {
  private context: AudioContext | null = null;
  private gain: GainNode | null = null;
  private buffers = new Map<AudioCue, Promise<AudioBuffer | null>>();
  private sources = new Map<AudioChannel, AudioBufferSourceNode>();
  private epochs = { game: 0, notification: 0 };
  private continuation = new Map<AudioChannel, string>();
  private abort = new AbortController();
  private disposed = false;
  private preferences = defaultAudioPreferences;
  private seen = new Set<string>();

  constructor(
    private visible = () => typeof document !== "undefined" && document.visibilityState === "visible",
    private now = Date.now,
  ) {}

  isRunning() { return this.context?.state === "running"; }

  /** Must be called directly by a deliberate user gesture, never by a game event. */
  async unlock(): Promise<boolean> {
    if (this.disposed || typeof window === "undefined") return false;
    try {
      if (!this.context) {
        this.context = new window.AudioContext();
        this.gain = this.context.createGain();
        this.gain.gain.value = this.preferences.volume;
        this.gain.connect(this.context.destination);
      }
      await this.context.resume();
      if (!this.visible()) { this.suspend(); return false; }
      return !this.disposed && this.context.state === "running";
    } catch {
      return false;
    }
  }

  setPreferences(preferences: AudioPreferences) {
    this.preferences = { ...preferences };
    if (this.gain) this.gain.gain.value = preferences.volume;
    if (preferences.muted || !preferences.effects || preferences.volume === 0) this.stop();
  }

  private available() {
    return !this.disposed && this.visible() && this.context?.state === "running" &&
      !this.preferences.muted && this.preferences.effects && this.preferences.volume > 0;
  }

  /** Consumed even when muted/locked: enabling audio must not revive old events. */
  playOnce(cue: AudioCue, eventId: string, continueOnPath?: string) {
    if (this.seen.has(eventId)) return;
    this.seen.add(eventId);
    if (this.seen.size > 512) this.seen.delete(this.seen.values().next().value!);
    this.play(cue, continueOnPath);
  }

  play(cue: AudioCue, continueOnPath?: string) {
    if (!this.available()) return;
    const channel = audioAssets[cue].channel;
    this.stop(channel);
    if (continueOnPath) this.continuation.set(channel, continueOnPath);
    const epoch = this.epochs[channel];
    const at = this.now();
    // Fetch/decode starts after authoritative move processing has returned.
    void Promise.resolve().then(async () => {
      if (!this.available() || epoch !== this.epochs[channel]) return;
      const buffer = await this.buffer(cue);
      if (!buffer || !this.available() || epoch !== this.epochs[channel] || this.now() - at > MAX_CUE_AGE_MS) return;
      const source = this.context!.createBufferSource();
      source.buffer = buffer;
      source.connect(this.gain!);
      source.onended = () => {
        source.disconnect();
        if (this.sources.get(channel) === source) this.sources.delete(channel);
      };
      this.sources.set(channel, source);
      source.start();
    }).catch(() => {
      if (epoch === this.epochs[channel]) this.stop(channel);
      // Audio failures never escape into gameplay.
    });
  }

  private buffer(cue: AudioCue) {
    let buffer = this.buffers.get(cue);
    if (!buffer) {
      buffer = fetch(audioAssets[cue].url, { signal: this.abort.signal })
        .then((response) => response.ok ? response.arrayBuffer() : Promise.reject(new Error("Audio unavailable")))
        .then((bytes) => this.context!.decodeAudioData(bytes))
        .catch(() => null);
      this.buffers.set(cue, buffer);
    }
    return buffer;
  }

  stop(channel?: AudioChannel) {
    const channels: AudioChannel[] = channel ? [channel] : ["game", "notification"];
    for (const name of channels) {
      this.epochs[name]++;
      this.continuation.delete(name);
      const source = this.sources.get(name);
      this.sources.delete(name);
      if (source) {
        source.onended = null;
        try { source.stop(); } catch { /* Already ended. */ }
        source.disconnect();
      }
    }
  }

  navigate(pathname: string) {
    for (const channel of ["game", "notification"] as const)
      if (this.continuation.get(channel) !== pathname) this.stop(channel);
  }

  /** Discard pending decodes and active sounds on hide/navigation, without a playback backlog. */
  suspend() {
    this.stop();
    if (this.context?.state === "running") void this.context.suspend().catch(() => {});
  }

  dispose() {
    this.disposed = true;
    this.stop();
    this.abort.abort();
    this.buffers.clear();
    this.seen.clear();
    if (this.context && this.context.state !== "closed") void this.context.close().catch(() => {});
  }
}
