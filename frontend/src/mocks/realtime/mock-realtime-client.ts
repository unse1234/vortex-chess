import {
  RealtimeRequestError,
  type RealtimeClient,
  type RealtimeConnectionStatus,
  type RealtimeEvent,
} from "@/lib/realtime/realtime-contract";

type Handler = (event: RealtimeEvent) => void;

/**
 * In-process stand-in for the realtime transport. Mock request handlers call
 * `publish` to push scripted events (a bot reply, a draw offer…), and the
 * scenario helpers below simulate a dropped connection. Events published
 * while the connection is down are lost, exactly like a real drop, so the app
 * has to resynchronise from a fresh snapshot.
 */
class MockRealtimeClient implements RealtimeClient {
  private status: RealtimeConnectionStatus = "idle";
  private statusListeners = new Set<(status: RealtimeConnectionStatus) => void>();
  private channels = new Map<string, Set<Handler>>();
  private timers = new Set<ReturnType<typeof setTimeout>>();

  getStatus = () => this.status;

  onStatusChange = (listener: (status: RealtimeConnectionStatus) => void) => {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  };

  subscribe = (channel: string, handler: Handler) => {
    const handlers = this.channels.get(channel) ?? new Set<Handler>();
    handlers.add(handler);
    this.channels.set(channel, handlers);
    return () => {
      handlers.delete(handler);
    };
  };

  private requestHandlers = new Map<string, (payload: unknown) => unknown>();

  /** Scenarios answer commands by type, like the server's acknowledgement. */
  handleRequests(type: string, handler: (payload: unknown) => unknown) {
    this.requestHandlers.set(type, handler);
  }

  request = async (type: string, payload: unknown) => {
    if (this.status !== "connected") throw new RealtimeRequestError("not-connected");
    const handler = this.requestHandlers.get(type);
    if (!handler) return { ok: false, error: { code: "not_found", message: "Unknown command.", retryable: false }, game: null };
    return handler(payload);
  };

  connect() {
    if (this.status !== "idle") return;
    this.setStatus("connecting");
    this.later(() => this.setStatus("connected"), 150);
  }

  disconnect() {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    this.setStatus("idle");
  }

  /** Delivers an event to subscribers of its channel, if currently connected. */
  publish(event: RealtimeEvent) {
    if (this.status !== "connected") return;
    for (const handler of this.channels.get(event.channel) ?? []) handler(event);
  }

  /** Simulates the connection dropping and coming back after `durationMs`. */
  simulateDrop(durationMs: number) {
    if (this.status !== "connected") return;
    this.setStatus("reconnecting");
    this.later(() => this.setStatus("connected"), durationMs);
  }

  private later(callback: () => void, delayMs: number) {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      callback();
    }, delayMs);
    this.timers.add(timer);
  }

  private setStatus(status: RealtimeConnectionStatus) {
    if (this.status === status) return;
    this.status = status;
    for (const listener of this.statusListeners) listener(status);
  }
}

export const mockRealtimeClient = new MockRealtimeClient();
