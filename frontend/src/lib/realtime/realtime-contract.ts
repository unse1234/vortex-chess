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
};
