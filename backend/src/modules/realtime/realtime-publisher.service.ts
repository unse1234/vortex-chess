import { Injectable, Logger } from '@nestjs/common';
import type { Server } from 'socket.io';
import {
  REALTIME_EVENT,
  USER_CHANNEL,
  userSocketRoom,
  type RealtimeEnvelope,
  type SocketIdentity,
} from './realtime.contracts';

/**
 * Emits only after the caller's database transaction has committed. Socket.IO
 * delivery is at-most-once; clients recover through HTTP snapshots/inboxes.
 */
@Injectable()
export class RealtimePublisher {
  private readonly logger = new Logger(RealtimePublisher.name);
  private server?: Server;

  attach(server: Server) {
    this.server = server;
  }

  toUser(userId: string, type: string, payload: unknown) {
    const envelope: RealtimeEnvelope = { channel: USER_CHANNEL, type, payload };
    this.server?.to(userSocketRoom(userId)).emit(REALTIME_EVENT, envelope);
  }

  /**
   * Builds the payload per subscribed viewer, so permitted actions stay
   * viewer-specific. A null payload means the viewer lost access; that socket
   * is removed from the channel.
   */
  async toChannelViewers(
    channel: string,
    type: string,
    build: (userId: string) => unknown,
  ) {
    if (!this.server) return;
    try {
      const sockets = await this.server.in(channel).fetchSockets();
      for (const socket of sockets) {
        const identity = socket.data as SocketIdentity;
        const payload = build(identity.userId);
        if (payload === null) {
          socket.leave(channel);
          identity.channels?.delete(channel);
          socket.emit(REALTIME_EVENT, {
            channel,
            type: 'channel.closed',
            payload: { code: 'forbidden' },
          } satisfies RealtimeEnvelope);
          continue;
        }
        socket.emit(REALTIME_EVENT, {
          channel,
          type,
          payload,
        } satisfies RealtimeEnvelope);
      }
    } catch (error) {
      this.logger.warn(
        `Realtime publish failed: ${error instanceof Error ? error.name : 'UnknownError'}`,
      );
    }
  }

  /** Closes every connection authenticated with this session. */
  disconnectSession(sessionId: string) {
    if (!this.server) return;
    for (const socket of this.server.sockets.sockets.values()) {
      if ((socket.data as SocketIdentity).sessionId !== sessionId) continue;
      socket.emit(REALTIME_EVENT, {
        channel: USER_CHANNEL,
        type: 'session.ended',
        payload: {},
      } satisfies RealtimeEnvelope);
      socket.disconnect(true);
    }
  }
}
