// Load clients for games.bench.e2e-spec.ts, run in their own process so the
// server's event loop is measured without client work. Receives the job over
// IPC, plays every game with random legal moves from the server's own
// legal-move lists, and reports client-side timings back.
const { randomUUID } = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { io } = require('socket.io-client');

function pieceAt(fen, square) {
  const rank = fen.split(' ')[0].split('/')[8 - Number(square[1])];
  let file = 0;
  for (const char of rank) {
    if (/\d/.test(char)) file += Number(char);
    else if (file++ === square.charCodeAt(0) - 97) return char;
  }
  return null;
}

async function playGame(job, game, stats) {
  const sockets = game.tokens.map((token) =>
    io(job.baseUrl, {
      path: '/api/socket.io',
      auth: { token },
      transports: ['websocket'],
      extraHeaders: { Origin: job.origin },
      forceNew: true,
      reconnection: false,
    }),
  );
  const states = [null, null];
  const sentAt = new Map();
  let plies = 0;
  let finished = false;
  let resolveDone;
  const done = new Promise((resolve) => (resolveDone = resolve));
  const finish = () => {
    finished = true;
    resolveDone();
  };
  const think = () => job.thinkMin + Math.random() * (job.thinkMax - job.thinkMin);

  const maybeMove = (index) => {
    const state = states[index];
    if (finished || !state || !state.viewer.canMove || state.status.phase !== 'in-progress') return;
    if (plies >= job.plies) return finish();
    const origins = Object.keys(state.legalMoves);
    const from = origins[Math.floor(Math.random() * origins.length)];
    const targets = state.legalMoves[from];
    const to = targets[Math.floor(Math.random() * targets.length)];
    const promotion = pieceAt(state.fen, from)?.toLowerCase() === 'p' && /[18]$/.test(to) ? 'q' : undefined;
    const revision = state.revision;
    setTimeout(async () => {
      if (finished) return;
      const started = performance.now();
      sentAt.set(revision + 1, started);
      let ack;
      try {
        ack = await sockets[index].timeout(15_000).emitWithAck('game.move', {
          gameId: game.gameId,
          requestId: randomUUID(),
          expectedRevision: revision,
          from,
          to,
          ...(promotion ? { promotion } : {}),
        });
      } catch (error) {
        if (!finished) stats.errors.push(String(error));
        return finish();
      }
      stats.ack.push(performance.now() - started);
      if (!ack.ok) {
        stats.rejected += 1;
        return finish();
      }
      plies += 1;
      if (ack.game.revision > states[index].revision) states[index] = ack.game;
      if (ack.game.status.phase !== 'in-progress') finish();
    }, think());
  };

  sockets.forEach((socket, index) => {
    socket.on('event', (event) => {
      if (event.type === 'game.snapshot') {
        states[index] = event.payload.game;
        maybeMove(index);
      } else if (event.type === 'game.updated') {
        const update = event.payload;
        const sent = sentAt.get(update.revision);
        if (sent !== undefined && update.viewer.canMove) stats.delivery.push(performance.now() - sent);
        if (!states[index] || update.revision > states[index].revision) states[index] = update;
        if (update.status.phase !== 'in-progress') return finish();
        maybeMove(index);
      }
    });
  });
  await Promise.all(
    sockets.map(
      (socket) =>
        new Promise((resolve, reject) => {
          socket.once('connect', resolve);
          socket.once('connect_error', reject);
        }),
    ),
  );
  for (const socket of sockets) await socket.timeout(10_000).emitWithAck('channel.join', { channel: `game:${game.gameId}` });
  await done;
  for (const socket of sockets) socket.disconnect();
}

process.on('message', async (job) => {
  const stats = { ack: [], delivery: [], rejected: 0, errors: [] };
  const started = performance.now();
  await Promise.all(job.games.map((game) => playGame(job, game, stats)));
  process.send({ ...stats, seconds: (performance.now() - started) / 1000 }, () => process.exit(0));
});
