import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { TokenRenewal } from "@/lib/realtime/socket-realtime-client";

type Listener = (...args: unknown[]) => void;

/** Minimal Socket.IO client double: records emits and lets tests fire lifecycle events. */
class FakeSocket {
  connected = false;
  connectCalls = 0;
  emitted: { event: string; payload: unknown }[] = [];
  joinResponses: unknown[] = [];
  /** When set, acknowledgements never arrive and emits time out. */
  silent = false;
  private listeners = new Map<string, Listener[]>();
  auth: (cb: (data: unknown) => void) => void;
  constructor(options: { auth: (cb: (data: unknown) => void) => void }) {
    this.auth = options.auth;
  }
  on(event: string, listener: Listener) {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
    return this;
  }
  fire(event: string, ...args: unknown[]) {
    for (const listener of this.listeners.get(event) ?? []) listener(...args);
  }
  connect() {
    this.connectCalls += 1;
  }
  disconnect() {
    this.connected = false;
  }
  emit(event: string, payload: unknown) {
    this.emitted.push({ event, payload });
  }
  timeout() {
    return {
      emitWithAck: async (event: string, payload: unknown) => {
        this.emitted.push({ event, payload });
        if (this.silent) throw new Error("operation has timed out");
        return this.joinResponses.shift() ?? { ok: true };
      },
    };
  }
  /** Simulates a completed (re)connection. */
  open() {
    this.connected = true;
    this.fire("connect");
  }
  token() {
    let token: unknown;
    this.auth((data) => (token = data));
    return token;
  }
}

let socket: FakeSocket;
vi.mock("socket.io-client", () => ({
  io: (_url: string, options: { auth: (cb: (data: unknown) => void) => void }) => (socket = new FakeSocket(options)),
}));

const { createSocketRealtimeClient } = await import("@/lib/realtime/socket-realtime-client");
const { RealtimeRequestError } = await import("@/lib/realtime/realtime-contract");

const joins = () => socket.emitted.filter((e) => e.event === "channel.join").map((e) => (e.payload as { channel: string }).channel);
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("Socket.IO realtime adapter", () => {
  let token: string;
  let renew: Mock<() => Promise<TokenRenewal>>;
  beforeEach(() => {
    token = "token-1";
    renew = vi.fn(async (): Promise<TokenRenewal> => {
      token = "token-2";
      return "renewed";
    });
  });
  const client = () => createSocketRealtimeClient({ url: "http://api", path: "/api/socket.io", getToken: () => token, renewToken: renew });

  it("joins a channel once for several handlers, leaves on the last unsubscribe, and rejoins after reconnect", async () => {
    const realtime = client();
    realtime.connect();
    socket.open();
    const received: string[] = [];
    const stopA = realtime.subscribe("room:1", (e) => received.push(`a:${e.type}`));
    const stopB = realtime.subscribe("room:1", (e) => received.push(`b:${e.type}`));
    realtime.subscribe("user", () => received.push("user"));
    await flush();
    expect(joins()).toEqual(["room:1"]);

    socket.fire("event", { channel: "room:1", type: "room.updated", payload: {} });
    socket.fire("event", { channel: "room:2", type: "room.updated", payload: {} });
    expect(received).toEqual(["a:room.updated", "b:room.updated"]);

    socket.fire("disconnect", "transport close");
    expect(realtime.getStatus()).toBe("reconnecting");
    socket.open();
    await flush();
    expect(joins()).toEqual(["room:1", "room:1"]);
    expect(realtime.getStatus()).toBe("connected");

    stopA();
    expect(socket.emitted.some((e) => e.event === "channel.leave")).toBe(false);
    stopB();
    expect(socket.emitted.filter((e) => e.event === "channel.leave")).toEqual([{ event: "channel.leave", payload: { channel: "room:1" } }]);
  });

  it("reports a rejected subscription to its handlers", async () => {
    const realtime = client();
    realtime.connect();
    socket.open();
    socket.joinResponses.push({ ok: false, error: { code: "forbidden", message: "No" } });
    const events: string[] = [];
    realtime.subscribe("room:9", (e) => events.push(e.type));
    await flush();
    expect(events).toEqual(["channel.error"]);
  });

  it("renews credentials after an authentication rejection and reconnects with the new token", async () => {
    const realtime = client();
    realtime.connect();
    expect(socket.token()).toEqual({ token: "token-1" });
    socket.fire("connect_error", new Error("unauthenticated"));
    await flush();
    expect(renew).toHaveBeenCalledTimes(1);
    expect(socket.connectCalls).toBe(2);
    expect(socket.token()).toEqual({ token: "token-2" });
  });

  it("stops when the session has ended, and after a server-side close renews before reconnecting", async () => {
    renew.mockResolvedValueOnce("ended");
    const realtime = client();
    realtime.connect();
    socket.fire("connect_error", new Error("unauthenticated"));
    await flush();
    expect(realtime.getStatus()).toBe("idle");
    expect(socket.connectCalls).toBe(1);

    const second = client();
    second.connect();
    socket.open();
    socket.fire("disconnect", "io server disconnect");
    await flush();
    expect(renew).toHaveBeenCalledTimes(2);
    expect(socket.connectCalls).toBe(2);
  });

  it("does not reconnect after an explicit disconnect", async () => {
    const realtime = client();
    realtime.connect();
    socket.open();
    realtime.disconnect();
    socket.fire("disconnect", "io client disconnect");
    await flush();
    expect(realtime.getStatus()).toBe("idle");
    expect(renew).not.toHaveBeenCalled();
  });

  it("sends commands only while connected, and reports a missing acknowledgement as uncertain", async () => {
    const realtime = client();
    realtime.connect();
    // Never buffered for later delivery while disconnected.
    await expect(realtime.request("game.move", { requestId: "r1" })).rejects.toEqual(new RealtimeRequestError("not-connected"));
    expect(socket.emitted.some((e) => e.event === "game.move")).toBe(false);

    socket.open();
    socket.joinResponses.push({ ok: true, duplicate: false });
    await expect(realtime.request("game.move", { requestId: "r2" })).resolves.toEqual({ ok: true, duplicate: false });

    socket.silent = true;
    const failure = await realtime.request("game.move", { requestId: "r3" }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(RealtimeRequestError);
    expect((failure as InstanceType<typeof RealtimeRequestError>).reason).toBe("timeout");
  });
});
