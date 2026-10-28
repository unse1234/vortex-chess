import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AudioManager } from "./audio-manager";
import { defaultAudioPreferences } from "./audio-preferences";

class FakeContext {
  state = "suspended";
  destination = {};
  gain = { gain: { value: 1 }, connect: vi.fn() };
  sources: { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn>; onended: (() => void) | null }[] = [];
  resume = vi.fn(async () => { this.state = "running"; });
  suspend = vi.fn(async () => { this.state = "suspended"; });
  close = vi.fn(async () => { this.state = "closed"; });
  decodeAudioData = vi.fn(async () => ({ duration: 0.2 }));
  createGain = () => this.gain;
  createBufferSource = () => {
    const source = { buffer: null, connect: vi.fn(), start: vi.fn(), stop: vi.fn(), disconnect: vi.fn(), onended: null };
    this.sources.push(source);
    return source;
  };
}

const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
let context: FakeContext;
let visible: boolean;
let now: number;
let manager: AudioManager;
let fetchAudio: ReturnType<typeof vi.fn>;

beforeEach(() => {
  context = new FakeContext();
  visible = true;
  now = 1_000;
  vi.stubGlobal("window", { AudioContext: class { constructor() { return context; } } });
  fetchAudio = vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }));
  vi.stubGlobal("fetch", fetchAudio);
  manager = new AudioManager(() => visible, () => now);
});
afterEach(() => { manager.dispose(); vi.unstubAllGlobals(); });

describe("browser audio lifecycle", () => {
  it("does not access browser APIs on construction or queue blocked events", async () => {
    manager.playOnce("capture", "move:1");
    expect(fetchAudio).not.toHaveBeenCalled();
    expect(await manager.unlock()).toBe(true);
    manager.playOnce("capture", "move:1");
    await flush();
    expect(context.sources).toHaveLength(0);
    manager.playOnce("capture", "move:2");
    await flush();
    expect(context.sources).toHaveLength(1);
  });

  it("reuses one decoded resource and deduplicates stable event ids", async () => {
    await manager.unlock();
    manager.playOnce("moveSelf", "g:2");
    await flush();
    manager.playOnce("moveSelf", "g:2");
    manager.playOnce("moveSelf", "g:3");
    await flush();
    expect(fetchAudio).toHaveBeenCalledTimes(1);
    expect(context.decodeAudioData).toHaveBeenCalledTimes(1);
    expect(context.sources).toHaveLength(2);
    expect(context.sources[0].stop).toHaveBeenCalledOnce();
  });

  it.each([{ muted: true }, { effects: false }, { volume: 0 }])("obeys preferences before unlocking: %j", async (patch) => {
    manager.setPreferences({ ...defaultAudioPreferences, ...patch });
    await manager.unlock();
    manager.play("check");
    await flush();
    expect(fetchAudio).not.toHaveBeenCalled();
  });

  it("applies volume and immediately stops when muted", async () => {
    await manager.unlock();
    manager.setPreferences({ ...defaultAudioPreferences, volume: 0.2 });
    manager.play("check");
    await flush();
    expect(context.gain.gain.value).toBe(0.2);
    manager.setPreferences({ ...defaultAudioPreferences, muted: true });
    expect(context.sources[0].stop).toHaveBeenCalledOnce();
    expect(context.sources[0].disconnect).toHaveBeenCalledOnce();
  });

  it("replaces a pending move effect with the newer result", async () => {
    await manager.unlock();
    manager.play("capture");
    manager.play("gameEnd");
    await flush();
    expect(fetchAudio).toHaveBeenCalledTimes(1);
    expect(fetchAudio.mock.calls[0][0]).toContain("game-end.mp3");
    expect(context.sources).toHaveLength(1);
  });

  it.each(["stop", "suspend", "dispose", "hidden", "expired"])("discards late loading after %s", async (action) => {
    let resolve!: (value: { duration: number }) => void;
    context.decodeAudioData.mockImplementation(() => new Promise((done) => { resolve = done; }));
    await manager.unlock();
    manager.play("capture");
    await flush();
    if (action === "hidden") visible = false;
    else if (action === "expired") now += 751;
    else manager[action as "stop" | "suspend" | "dispose"]();
    resolve({ duration: 0.2 });
    await flush();
    expect(context.sources).toHaveLength(0);
  });

  it("does not revive background sounds on the next unlock", async () => {
    await manager.unlock();
    manager.suspend();
    manager.playOnce("check", "old");
    await manager.unlock();
    await flush();
    expect(context.sources).toHaveLength(0);
    manager.playOnce("moveOpponent", "new");
    await flush();
    expect(context.sources).toHaveLength(1);
  });

  it("cancels sounds across navigation except a start cue entering its intended game", async () => {
    await manager.unlock();
    manager.playOnce("gameStart", "start:g", "/games/g");
    manager.navigate("/games/g");
    await flush();
    expect(context.sources).toHaveLength(1);
    manager.navigate("/play");
    expect(context.sources[0].stop).toHaveBeenCalledOnce();
    manager.play("capture");
    manager.navigate("/games/other");
    await flush();
    expect(context.sources).toHaveLength(1);
  });

  it.each(["missing", "network", "decode"])("absorbs %s failures", async (failure) => {
    if (failure === "missing") fetchAudio.mockResolvedValue({ ok: false });
    if (failure === "network") fetchAudio.mockRejectedValue(new Error("offline"));
    if (failure === "decode") context.decodeAudioData.mockRejectedValue(new Error("unsupported"));
    await manager.unlock();
    manager.play("castle");
    await flush();
    expect(context.sources).toHaveLength(0);
  });

  it("handles rejected unlocking and unavailable AudioContext", async () => {
    context.resume.mockRejectedValue(new Error("NotAllowedError"));
    expect(await manager.unlock()).toBe(false);
    manager.play("capture");
    await flush();
    expect(fetchAudio).not.toHaveBeenCalled();
    vi.stubGlobal("window", {});
    const unsupported = new AudioManager();
    expect(await unsupported.unlock()).toBe(false);
    unsupported.dispose();
  });

  it("cleans up a source when the browser refuses to start it", async () => {
    const create = context.createBufferSource;
    context.createBufferSource = () => {
      const source = create();
      source.start.mockImplementation(() => { throw Error("Playback refused"); });
      return source;
    };
    await manager.unlock();
    manager.play("capture");
    await flush();
    expect(context.sources[0].disconnect).toHaveBeenCalledOnce();
    manager.play("check");
    await flush();
    expect(context.sources).toHaveLength(2);
  });

  it("aborts resource loads and closes the context on disposal", async () => {
    await manager.unlock();
    manager.play("capture");
    await flush();
    const signal = fetchAudio.mock.calls[0][1].signal as AbortSignal;
    manager.dispose();
    expect(signal.aborted).toBe(true);
    expect(context.close).toHaveBeenCalledOnce();
    manager.play("check");
    expect(fetchAudio).toHaveBeenCalledTimes(1);
  });
});
