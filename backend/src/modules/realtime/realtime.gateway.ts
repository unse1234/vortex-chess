import {
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  type OnGatewayInit,
} from '@nestjs/websockets';
import { SkipThrottle } from '@nestjs/throttler';
import type { Subscription } from 'rxjs';
import type { Server, Socket } from 'socket.io';
import type { Environment } from '../../config/environment';
import { AuthService } from '../auth/auth.service';
import { SessionEventsService } from '../auth/session-events.service';
import { PresenceService } from './presence.service';
import { RealtimeChannels } from './realtime-channels.service';
import { RealtimePublisher } from './realtime-publisher.service';
import {
  REALTIME_EVENT,
  USER_CHANNEL,
  userSocketRoom,
  type RealtimeAck,
  type SocketIdentity,
} from './realtime.contracts';

const MAX_CHANNELS_PER_SOCKET = 20;
const failure = (code: string, message: string): RealtimeAck => ({
  ok: false,
  error: { code, message },
});
function connectError(code: string, message: string) {
  return Object.assign(new Error(code), { data: { code, message } });
}
function channelOf(body: unknown) {
  return typeof body === 'object' && body !== null && 'channel' in body
    ? body.channel
    : undefined;
}

/**
 * Transport only: authenticates connections, tracks presence and joins
 * authorized channels. Features publish through RealtimePublisher after commit.
 */
@SkipThrottle()
@WebSocketGateway()
export class RealtimeGateway
  implements
    OnGatewayInit,
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnModuleInit,
    OnModuleDestroy
{
  private readonly logger = new Logger(RealtimeGateway.name);
  private server?: Server;
  private sessionCheck?: NodeJS.Timeout;
  private revocations?: Subscription;

  constructor(
    private readonly auth: AuthService,
    private readonly sessionEvents: SessionEventsService,
    private readonly presence: PresenceService,
    private readonly channels: RealtimeChannels,
    private readonly publisher: RealtimePublisher,
    private readonly config: ConfigService<Environment, true>,
  ) {}

  onModuleInit() {
    this.revocations = this.sessionEvents.revoked$.subscribe((sessionId) =>
      this.publisher.disconnectSession(sessionId),
    );
    const seconds = this.config.get('REALTIME_SESSION_CHECK_SECONDS', {
      infer: true,
    });
    // Catches expiry and revocations made outside this process's auth paths.
    this.sessionCheck = setInterval(
      () => void this.disconnectInactiveSessions(),
      seconds * 1000,
    );
    this.sessionCheck.unref();
  }

  onModuleDestroy() {
    this.revocations?.unsubscribe();
    clearInterval(this.sessionCheck);
  }

  afterInit(server: Server) {
    this.server = server;
    this.publisher.attach(server);
    server.use((socket, next) => {
      const token = (socket.handshake.auth as Record<string, unknown>)?.token;
      if (typeof token !== 'string' || token.length > 4096)
        return next(connectError('unauthenticated', 'Sign in to connect.'));
      this.auth
        .authenticateSession(token)
        .then(({ user, sessionId }) => {
          const identity: SocketIdentity = {
            userId: user.id,
            sessionId,
            channels: new Set(),
          };
          socket.data = identity;
          next();
        })
        .catch(() =>
          next(connectError('unauthenticated', 'Your session has expired.')),
        );
    });
  }

  handleConnection(socket: Socket) {
    const identity = socket.data as SocketIdentity | undefined;
    if (!identity?.userId) {
      socket.disconnect(true);
      return;
    }
    const limit = this.config.get('REALTIME_MAX_SOCKETS_PER_USER', {
      infer: true,
    });
    if (this.presence.connectionCount(identity.userId) >= limit) {
      socket.emit(REALTIME_EVENT, {
        channel: USER_CHANNEL,
        type: 'connection.rejected',
        payload: { code: 'too_many_connections' },
      });
      socket.disconnect(true);
      return;
    }
    void socket.join(userSocketRoom(identity.userId));
    this.presence.connect(identity.userId, socket.id);
  }

  handleDisconnect(socket: Socket) {
    const identity = socket.data as SocketIdentity | undefined;
    if (identity?.userId) this.presence.disconnect(identity.userId, socket.id);
  }

  @SubscribeMessage('channel.join')
  async join(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: unknown,
  ): Promise<RealtimeAck> {
    const identity = socket.data as SocketIdentity;
    const channel = channelOf(body);
    if (typeof channel !== 'string' || channel.length > 80)
      return failure('invalid_request', 'A channel is required.');
    const resolved = this.channels.resolve(channel);
    if (!resolved) return failure('not_found', 'Unknown channel.');
    if (
      !identity.channels.has(channel) &&
      identity.channels.size >= MAX_CHANNELS_PER_SOCKET
    )
      return failure('too_many_channels', 'Too many subscriptions.');
    try {
      // The authenticated socket identity decides access, never client data.
      const sync = await resolved.authorizer(
        identity.userId,
        resolved.resourceId,
      );
      if (!sync)
        return failure('forbidden', 'You cannot subscribe to this channel.');
      if (!socket.connected)
        return failure('disconnected', 'The connection closed.');
      await socket.join(channel);
      identity.channels.add(channel);
      // Sent after joining, so no committed change can fall between the two.
      for (const envelope of sync) socket.emit(REALTIME_EVENT, envelope);
      return { ok: true };
    } catch (error) {
      this.logger.warn(
        `Channel join failed: ${error instanceof Error ? error.name : 'UnknownError'}`,
      );
      return failure('server_error', 'The subscription could not be created.');
    }
  }

  @SubscribeMessage('channel.leave')
  async leave(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: unknown,
  ): Promise<RealtimeAck> {
    const identity = socket.data as SocketIdentity;
    const channel = channelOf(body);
    if (typeof channel === 'string' && identity.channels.delete(channel))
      await socket.leave(channel);
    return { ok: true };
  }

  private async disconnectInactiveSessions() {
    if (!this.server) return;
    try {
      const ids = [
        ...new Set(
          [...this.server.sockets.sockets.values()].map(
            (socket) => (socket.data as SocketIdentity).sessionId,
          ),
        ),
      ].filter(Boolean);
      const active = await this.auth.activeSessionIds(ids);
      for (const id of ids)
        if (!active.has(id)) this.publisher.disconnectSession(id);
    } catch (error) {
      this.logger.warn(
        `Session check failed: ${error instanceof Error ? error.name : 'UnknownError'}`,
      );
    }
  }
}
