import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import { SkipThrottle } from '@nestjs/throttler';
import { performance } from 'node:perf_hooks';
import type { Socket } from 'socket.io';
import type { z } from 'zod';
import { AuthService } from '../auth/auth.service';
import type { SocketIdentity } from '../realtime/realtime.contracts';
import { RealtimePublisher } from '../realtime/realtime-publisher.service';
import { ServerClock } from './clocks/server-clock';
import type { GameLiveView } from './game-view';
import {
  realtimeDrawResponseSchema,
  realtimeMoveSchema,
  realtimeSimpleSchema,
} from './games.schemas';
import {
  GameCommandsService,
  type CommandContext,
  type CommandResult,
} from './services/game-commands.service';

/** Acknowledgement of a game command; `game` is the authoritative state the client should hold. */
export type GameCommandAck =
  | { ok: true; duplicate: boolean; game: GameLiveView }
  | {
      ok: false;
      error: { code: string; message: string; retryable: boolean };
      game: GameLiveView | null;
    };

function toAck(result: CommandResult): GameCommandAck {
  if (result.ok) return result;
  const { code, message, retryable } = result.error;
  return { ok: false, error: { code, message, retryable }, game: result.game };
}

/**
 * A socket's session is reconfirmed at most this often before game commands.
 * Same-instance revocations disconnect immediately; this bounds the window for
 * revocations committed by another instance.
 */
const SESSION_RECHECK_MS = 5_000;

const sessionEnded: GameCommandAck = {
  ok: false,
  error: { code: 'unauthenticated', message: 'Your session has ended. Sign in again.', retryable: false },
  game: null,
};

const invalid: GameCommandAck = {
  ok: false,
  error: { code: 'invalid_request', message: 'The command is malformed.', retryable: false },
  game: null,
};

/**
 * Realtime transport for game commands. The actor is always the socket's
 * authenticated account; every command goes to the same application service
 * as the HTTP endpoints.
 */
@SkipThrottle()
@WebSocketGateway()
export class GamesGateway {
  constructor(
    private readonly commands: GameCommandsService,
    private readonly clock: ServerClock,
    private readonly auth: AuthService,
    private readonly publisher: RealtimePublisher,
  ) {}

  @SubscribeMessage('game.move')
  move(@ConnectedSocket() socket: Socket, @MessageBody() body: unknown) {
    return this.handle(socket, body, realtimeMoveSchema, (actor, { gameId, ...input }, ctx) =>
      this.commands.move(actor, gameId, input, ctx),
    );
  }

  @SubscribeMessage('game.resign')
  resign(@ConnectedSocket() socket: Socket, @MessageBody() body: unknown) {
    return this.handle(socket, body, realtimeSimpleSchema, (actor, { gameId, ...input }, ctx) =>
      this.commands.resign(actor, gameId, input, ctx),
    );
  }

  @SubscribeMessage('game.draw.offer')
  offerDraw(@ConnectedSocket() socket: Socket, @MessageBody() body: unknown) {
    return this.handle(socket, body, realtimeSimpleSchema, (actor, { gameId, ...input }, ctx) =>
      this.commands.offerDraw(actor, gameId, input, ctx),
    );
  }

  @SubscribeMessage('game.draw.respond')
  respondToDraw(@ConnectedSocket() socket: Socket, @MessageBody() body: unknown) {
    return this.handle(socket, body, realtimeDrawResponseSchema, (actor, { gameId, ...input }, ctx) =>
      this.commands.respondToDraw(actor, gameId, input, ctx),
    );
  }

  private async handle<S extends z.ZodType>(
    socket: Socket,
    body: unknown,
    schema: S,
    run: (actorId: string, input: z.infer<S>, ctx: CommandContext) => Promise<CommandResult>,
  ): Promise<GameCommandAck> {
    // Receipt time is taken before anything else, including validation.
    const ctx: CommandContext = { receivedAt: this.clock.now(), receivedPerf: performance.now() };
    const identity = socket.data as SocketIdentity | undefined;
    if (!identity?.userId) return invalid;
    const parsed = schema.safeParse(body);
    if (!parsed.success) return invalid;
    if (!(await this.sessionActive(identity))) return sessionEnded;
    return toAck(await run(identity.userId, parsed.data, ctx));
  }

  private async sessionActive(identity: SocketIdentity) {
    const now = Date.now();
    if (now - identity.verifiedAt < SESSION_RECHECK_MS) return true;
    const active = await this.auth.activeSessionIds([identity.sessionId]);
    if (active.has(identity.sessionId)) {
      identity.verifiedAt = now;
      return true;
    }
    // After the acknowledgement is flushed, so the client learns why.
    setImmediate(() => this.publisher.disconnectSession(identity.sessionId));
    return false;
  }
}
