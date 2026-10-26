import { io, type Socket } from "socket.io-client";
import {
  PERSONAL_CHANNEL,
  RealtimeRequestError,
  type RealtimeClient,
  type RealtimeConnectionStatus,
  type RealtimeEvent,
} from "@/lib/realtime/realtime-contract";

type Handler = (event: RealtimeEvent) => void;

/** Result of asking the session owner for fresh credentials. */
export type TokenRenewal = "renewed" | "ended" | "retry";

type SocketRealtimeOptions = {
  url: string;
  path: string;
  /** Read on every (re)connection attempt, so renewed tokens are used. */
  getToken: () => string | null;
  /** Called after the server rejects or ends the authenticated connection. */
  renewToken: () => Promise<TokenRenewal>;
};

const RETRY_DELAY_MS = 5_000;
const MAX_AUTH_FAILURES = 3;
const ACK_TIMEOUT_MS = 5_000;

export type SocketRealtimeClient = RealtimeClient & {
  connect: () => void;
  disconnect: () => void;
};

/**
 * Socket.IO implementation of the realtime contract. Server channels other
 * than the personal one are joined when the first local handler subscribes
 * and rejoined after every reconnect; the server answers each join with a
 * fresh snapshot, which is the resynchronization boundary.
 */
export function createSocketRealtimeClient(options: SocketRealtimeOptions): SocketRealtimeClient {
  let status: RealtimeConnectionStatus = "idle";
  let hasConnected = false;
  let stopped = true;
  let authFailures = 0;
  let renewing = false;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  const statusListeners = new Set<(status: RealtimeConnectionStatus) => void>();
  const channels = new Map<string, Set<Handler>>();

  const socket: Socket = io(options.url, {
    path: options.path,
    autoConnect: false,
    transports: ["websocket", "polling"],
    auth: (callback) => callback({ token: options.getToken() }),
    reconnectionDelay: 1_000,
    reconnectionDelayMax: 10_000,
  });

  function setStatus(next: RealtimeConnectionStatus) {
    if (status === next) return;
    status = next;
    for (const listener of statusListeners) listener(next);
  }

  function deliver(event: RealtimeEvent) {
    // Copy: a handler may unsubscribe while being notified.
    for (const handler of [...(channels.get(event.channel) ?? [])]) handler(event);
  }

  async function join(channel: string) {
    try {
      const ack = (await socket.timeout(ACK_TIMEOUT_MS).emitWithAck("channel.join", { channel })) as
        | { ok: true }
        | { ok: false; error: { code: string; message: string } };
      if (!ack.ok) deliver({ channel, type: "channel.error", payload: ack.error });
    } catch {
      // No acknowledgement: the outcome is unknown, so subscribers resynchronize over HTTP.
      if (socket.connected)
        deliver({ channel, type: "channel.error", payload: { code: "timeout", message: "Subscription timed out." } });
    }
  }

  /** Server rejected or ended our credentials: renew once, then reconnect or stop. */
  async function recoverAuthentication() {
    if (renewing || stopped) return;
    renewing = true;
    authFailures += 1;
    setStatus(hasConnected ? "reconnecting" : "connecting");
    try {
      const renewal = authFailures > MAX_AUTH_FAILURES ? "ended" : await options.renewToken();
      if (stopped) return;
      if (renewal === "renewed") socket.connect();
      else if (renewal === "retry") retryTimer = setTimeout(() => !stopped && socket.connect(), RETRY_DELAY_MS);
      else setStatus("idle");
    } finally {
      renewing = false;
    }
  }

  socket.on("connect", () => {
    hasConnected = true;
    authFailures = 0;
    setStatus("connected");
    for (const channel of channels.keys()) if (channel !== PERSONAL_CHANNEL) void join(channel);
  });
  socket.on("connect_error", (error: Error) => {
    if (error.message === "unauthenticated") void recoverAuthentication();
    else setStatus(hasConnected ? "reconnecting" : "connecting");
  });
  socket.on("disconnect", (reason) => {
    if (stopped) return setStatus("idle");
    // A server-side close (sign-out elsewhere, revoked session) is not retried automatically.
    if (reason === "io server disconnect") void recoverAuthentication();
    else setStatus("reconnecting");
  });
  socket.on("event", (event: RealtimeEvent) => {
    if (event && typeof event.channel === "string" && typeof event.type === "string") deliver(event);
  });

  return {
    getStatus: () => status,
    onStatusChange(listener) {
      statusListeners.add(listener);
      return () => {
        statusListeners.delete(listener);
      };
    },
    subscribe(channel, handler) {
      const handlers = channels.get(channel) ?? new Set<Handler>();
      const first = handlers.size === 0;
      handlers.add(handler);
      channels.set(channel, handlers);
      if (first && channel !== PERSONAL_CHANNEL && socket.connected) void join(channel);
      return () => {
        if (!handlers.delete(handler) || handlers.size > 0) return;
        channels.delete(channel);
        if (channel !== PERSONAL_CHANNEL && socket.connected) socket.emit("channel.leave", { channel });
      };
    },
    async request(type, payload, { timeoutMs = ACK_TIMEOUT_MS } = {}) {
      // Socket.IO would buffer an emit made while disconnected and send it
      // later; a command must never be delivered after the player stopped
      // waiting for it, so it is refused instead.
      if (!socket.connected) throw new RealtimeRequestError("not-connected");
      try {
        return await socket.timeout(timeoutMs).emitWithAck(type, payload);
      } catch {
        throw new RealtimeRequestError("timeout");
      }
    },
    connect() {
      if (!stopped) return;
      stopped = false;
      setStatus("connecting");
      socket.connect();
    },
    disconnect() {
      stopped = true;
      clearTimeout(retryTimer);
      socket.disconnect();
      setStatus("idle");
    },
  };
}
