/**
 * Transport-agnostic realtime contract. The final protocol (Socket.IO or
 * another) is a backend decision; feature code only depends on this shape, so
 * swapping the transport doesn't touch game, chat or presence logic.
 */
export type RealtimeConnectionStatus = "idle" | "connecting" | "connected" | "reconnecting";

export type RealtimeEvent = {
  channel: string;
  type: string;
  payload: unknown;
};

export type RealtimeClient = {
  getStatus: () => RealtimeConnectionStatus;
  /** Calls `listener` on every status change; returns an unsubscribe function. */
  onStatusChange: (listener: (status: RealtimeConnectionStatus) => void) => () => void;
  /** Delivers events published on `channel`; returns an unsubscribe function. */
  subscribe: (channel: string, handler: (event: RealtimeEvent) => void) => () => void;
  /**
   * Sends a command and resolves with the server's acknowledgement. Rejects
   * with a RealtimeRequestError when no acknowledgement arrives: "not-connected"
   * means it was never sent; "timeout" means the outcome is unknown and the
   * caller must reconcile (for example by resending the same idempotent command).
   */
  request: (type: string, payload: unknown, options?: { timeoutMs?: number }) => Promise<unknown>;
};

export class RealtimeRequestError extends Error {
  constructor(readonly reason: "not-connected" | "timeout") {
    super(reason === "not-connected" ? "Not connected to the game server." : "The server didn't answer in time.");
    this.name = "RealtimeRequestError";
  }
}

/** Personal events for the signed-in account; delivered without a subscription command. */
export const PERSONAL_CHANNEL = "user";
