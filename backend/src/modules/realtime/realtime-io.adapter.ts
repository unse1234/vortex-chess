import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { Server, ServerOptions } from 'socket.io';

export const REALTIME_PATH = '/api/socket.io';

/**
 * Socket.IO on the API's HTTP server. Browsers authenticate with the
 * in-memory access token (not cookies), and handshakes from unlisted browser
 * origins are refused, including the WebSocket transport that CORS skips.
 */
export class RealtimeIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly origins: readonly string[],
  ) {
    super(app);
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    return super.createIOServer(port, {
      ...options,
      path: REALTIME_PATH,
      serveClient: false,
      maxHttpBufferSize: 16_000,
      pingInterval: 20_000,
      pingTimeout: 20_000,
      cors: { origin: [...this.origins], credentials: false },
      allowRequest: (request, callback) => {
        const origin = request.headers.origin;
        callback(null, !origin || this.origins.includes(origin));
      },
    } as ServerOptions) as Server;
  }
}
