/** Wire contract shared by every realtime feature. */
export type RealtimeEnvelope = {
  channel: string;
  type: string;
  payload: unknown;
};
export type RealtimeAck =
  | { ok: true }
  | { ok: false; error: { code: string; message: string } };

/** Server -> client event name carrying a RealtimeEnvelope. */
export const REALTIME_EVENT = 'event';
/** Personal events; the server only delivers a socket its own account's events. */
export const USER_CHANNEL = 'user';
export const roomChannel = (roomId: string) => `room:${roomId}`;
export const gameChannel = (gameId: string) => `game:${gameId}`;
/** Socket.IO room names are server-internal and never accepted from clients. */
export const userSocketRoom = (userId: string) => `user:${userId}`;

export type SocketIdentity = {
  userId: string;
  sessionId: string;
  channels: Set<string>;
};

/**
 * Authorizes a channel subscription and returns the events that bring the
 * subscriber up to date (the synchronization boundary), or null when denied.
 */
export type ChannelAuthorizer = (
  userId: string,
  resourceId: string,
) => Promise<RealtimeEnvelope[] | null>;
