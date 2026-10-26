import { gameChannel } from "@/features/games/realtime/game-events.types";
import type { GameCommandAck } from "@/features/games/types/game-command.types";
import type {
  Color,
  DrawOffer,
  GameClocks,
  GameMove,
  GameParticipant,
  GameResult,
  GameSnapshot,
  GameUpdate,
  PromotionPiece,
  Square,
  ViewerPermissions,
} from "@/features/games/types/game.types";
import { matchChatChannel, type ChatMessage } from "@/features/social/types/match-chat.types";
import { demoAccount } from "@/mocks/fixtures/account.fixtures";
import { demoGame, promotionDemo } from "@/mocks/fixtures/demo-game.data";
import { createRecentGames } from "@/mocks/fixtures/games.fixtures";
import { fromNow } from "@/mocks/fixtures/time";
import { mockRealtimeClient } from "@/mocks/realtime/mock-realtime-client";
import { getMockScenario } from "@/mocks/scenarios/network";
import { getMockSessionUser } from "@/mocks/session-state";
import { formatMovetext } from "@/features/games/pgn";

/**
 * A stand-in for the game server. Games follow precomputed lines (see
 * demo-game.data.ts) rather than a chess engine: the server accepts the
 * scripted move, "thinks" for a moment, and replies with the scripted answer.
 * Commands arrive through the mock realtime client and are acknowledged with
 * the same shapes as the real server.
 */

export const LIVE_GAME_ID = "vortex-demo";
export const PROMOTION_GAME_ID = "vortex-promotion";

const BOT_THINK_MS = 1_600;
const DRAW_ANSWER_MS = 1_800;
const INCREMENT_MS = 2_000;
const LAST_SCRIPTED_PLY = demoGame.positions[demoGame.positions.length - 1].ply;
const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
// Ply is relative to this scenario's saved initial position, whose FEN is move 70.
const PROMOTION_PLY = 1;

type GameKind = "line" | "promotion" | "archived";

type MockGame = {
  id: string;
  kind: GameKind;
  revision: number;
  /** Index into the scripted positions ("line" and "archived" games). */
  positionIndex: number;
  promotedTo: PromotionPiece | null;
  result: GameResult | null;
  drawOffer: DrawOffer | null;
  remainingMs: Record<Color, number>;
  runningSide: Color | null;
  /** When `remainingMs` was last brought up to date. */
  clockAt: number;
  startedAt: string;
  endedAt: string | null;
  opponent: GameParticipant;
};

const whitePlayer: GameParticipant = {
  id: demoAccount.id,
  username: demoAccount.username,
  avatarUrl: null,
  kind: "human",
  online: true,
};

const botPlayer: GameParticipant = {
  id: "bot-k4sp4r",
  username: "K4SP4R_AI",
  avatarUrl: null,
  kind: "engine",
  online: true,
};

const games = new Map<string, MockGame>();

type MockFailure = { ok: false; code: string; message: string };
type Outcome = { ok: true; move: GameMove | null } | MockFailure;

const fail = (code: string, message: string): MockFailure => ({ ok: false, code, message });

// ---------------------------------------------------------------------------
// Game lifecycle
// ---------------------------------------------------------------------------

function createGame(id: string): MockGame | null {
  const now = Date.now();
  const base = {
    id,
    revision: 1,
    positionIndex: 0,
    promotedTo: null,
    result: null,
    drawOffer: null,
    clockAt: now,
    startedAt: new Date(now - 6 * 60_000).toISOString(),
    endedAt: null,
    opponent: botPlayer,
  } satisfies Partial<MockGame>;

  if (id === LIVE_GAME_ID) {
    return { ...base, kind: "line", remainingMs: { w: 222_000, b: 74_000 }, runningSide: "w" };
  }
  if (id === PROMOTION_GAME_ID) {
    return { ...base, kind: "promotion", remainingMs: { w: 61_000, b: 48_000 }, runningSide: "w" };
  }

  const recent = createRecentGames(now).find((game) => game.id === id);
  if (!recent) return null;
  const result: GameResult =
    recent.result === "win"
      ? { outcome: "white", reason: "resignation" }
      : recent.result === "loss"
        ? { outcome: "black", reason: "timeout" }
        : { outcome: "draw", reason: "agreement" };
  return {
    ...base,
    kind: "archived",
    result,
    runningSide: null,
    remainingMs: { w: 177_000, b: 70_000 },
    endedAt: recent.endedAt,
    opponent: {
      id: recent.opponent.id,
      username: recent.opponent.username,
      avatarUrl: recent.opponent.avatarUrl,
      kind: "human",
      online: false,
    },
  };
}

export function getGameRoom(id: string): MockGame | null {
  const existing = games.get(id);
  if (existing) return existing;
  const created = createGame(id);
  if (!created) return null;
  games.set(id, created);
  scheduleScenarioEvents(created);
  return created;
}

/** Brings the running side's clock up to date. */
function settleClock(game: MockGame, now = Date.now()) {
  if (game.runningSide) game.remainingMs[game.runningSide] = Math.max(0, game.remainingMs[game.runningSide] - (now - game.clockAt));
  game.clockAt = now;
}

function currentTurn(game: MockGame): Color {
  if (game.kind === "promotion") return game.promotedTo ? "b" : "w";
  return demoGame.positions[game.positionIndex].ply % 2 === 0 ? "w" : "b";
}

// ---------------------------------------------------------------------------
// Snapshot building
// ---------------------------------------------------------------------------

function viewerPermissions(game: MockGame): ViewerPermissions {
  const live = game.result === null;
  const pendingOffer = game.drawOffer?.state === "pending";
  return {
    role: "player",
    color: "w",
    canMove: live && currentTurn(game) === "w",
    canResign: live,
    canOfferDraw: live && !pendingOffer,
    canRespondToDraw: live && pendingOffer && game.drawOffer?.by === "b",
  };
}

function toGameMove(move: { ply: number; san: string; from: Square; to: Square; fen: string; captured: GameMove["captured"] }, remainingMs: Record<Color, number>): GameMove {
  return {
    ply: move.ply,
    color: move.ply % 2 === 1 ? "w" : "b",
    san: move.san,
    uci: `${move.from}${move.to}`,
    from: move.from,
    to: move.to,
    promotion: null,
    captured: move.captured,
    fen: move.fen,
    remainingMs,
    elapsedMs: 0,
    playedAt: new Date().toISOString(),
    requestId: null,
  };
}

export function buildSnapshot(game: MockGame): GameSnapshot {
  const now = Date.now();
  settleClock(game, now);
  const clocks: GameClocks = {
    remainingMs: { w: game.remainingMs.w, b: game.remainingMs.b },
    runningSide: game.result ? null : game.runningSide,
    serverTime: now,
  };
  const viewer = viewerPermissions(game);
  const status: GameSnapshot["status"] = game.result
    ? { phase: "finished", result: game.result }
    : { phase: "in-progress", turn: currentTurn(game) };
  const resultToken = game.result?.outcome === "white" ? "1-0" : game.result?.outcome === "black" ? "0-1" : "1/2-1/2";

  const common = {
    id: game.id,
    roomId: null,
    revision: game.revision,
    timeControl: { category: "blitz", initialMs: 180_000, incrementMs: INCREMENT_MS },
    players: { w: whitePlayer, b: game.opponent },
    clocks,
    viewer,
    status,
    drawOffer: game.drawOffer,
    startedAt: game.startedAt,
    endedAt: game.endedAt,
    pgn: null,
  } as const;

  if (game.kind === "promotion") {
    const promoted = game.promotedTo ? promotionDemo.results[game.promotedTo] : null;
    const moves: GameMove[] = promoted
      ? [{ ...toGameMove({ ply: PROMOTION_PLY, san: promoted.san, ...promoted.lastMove, fen: promoted.fen, captured: null }, clocks.remainingMs), promotion: game.promotedTo, uci: `c7c8${game.promotedTo}` }]
      : [];
    return {
      ...common,
      pgn: game.result ? `[Event "Scripted demo"]\n[SetUp "1"]\n[FEN "${promotionDemo.startFen}"]\n[Result "${resultToken}"]\n\n${promoted ? `70. ${promoted.san} ` : ""}${resultToken}` : null,
      initialFen: promotionDemo.startFen,
      ply: promoted ? PROMOTION_PLY : PROMOTION_PLY - 1,
      fen: promoted?.fen ?? promotionDemo.startFen,
      moves,
      lastMove: promoted?.lastMove ?? null,
      checkSquare: promoted?.checkSquare ?? null,
      legalMoves: viewer.canMove ? promotionDemo.legalMoves : {},
    };
  }

  const position = demoGame.positions[game.positionIndex];
  const moves = demoGame.moves.slice(0, position.ply).map((move) => toGameMove(move, clocks.remainingMs));
  return {
    ...common,
    pgn: game.result ? `${formatMovetext(moves)} ${resultToken}`.trim() : null,
    initialFen: START_FEN,
    ply: position.ply,
    fen: position.fen,
    moves,
    lastMove: position.lastMove,
    checkSquare: position.checkSquare,
    legalMoves: viewer.canMove ? position.legalMoves : {},
  };
}

/** The compact update the real server would broadcast for the latest change. */
function toUpdate(snapshot: GameSnapshot, move: GameMove | null): GameUpdate {
  const { id, revision, ply, fen, status, clocks, lastMove, checkSquare, drawOffer, viewer, legalMoves, endedAt } = snapshot;
  return { id, revision, ply, fen, status, clocks, lastMove, checkSquare, drawOffer, viewer, legalMoves, endedAt, move };
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function publishSnapshot(game: MockGame) {
  mockRealtimeClient.publish({
    channel: gameChannel(game.id),
    type: "game.snapshot",
    payload: { game: buildSnapshot(game) },
  });
}

function bump(game: MockGame) {
  game.revision += 1;
  publishSnapshot(game);
}

function finish(game: MockGame, result: GameResult) {
  settleClock(game);
  game.result = result;
  game.runningSide = null;
  game.drawOffer = null;
  game.endedAt = new Date().toISOString();
}

function requirePlayerOnMove(game: MockGame): MockFailure | null {
  if (game.result) return fail("game_finished", "This game has already finished.");
  if (currentTurn(game) !== "w") return fail("not_your_turn", "It isn't your turn to move.");
  return null;
}

type MovePayload = { expectedRevision: number; from: Square; to: Square; promotion?: PromotionPiece };

function applyMove(game: MockGame, command: MovePayload): Outcome {
  const blocked = requirePlayerOnMove(game);
  if (blocked) return blocked;
  if (command.expectedRevision !== game.revision) {
    return fail("stale_revision", "The position changed while you were moving. Your board has been refreshed.");
  }

  if (game.kind === "promotion") return applyPromotion(game, command);

  const position = demoGame.positions[game.positionIndex];
  if (!position.legalMoves[command.from]?.includes(command.to)) {
    return fail("illegal_move", "That move isn't legal in this position.");
  }
  if (position.ply >= LAST_SCRIPTED_PLY) {
    return fail("preview_line_ended", "That's the end of the scripted preview game. You can still resign or offer a draw.");
  }
  const expected = demoGame.moves[position.ply];
  if (command.from !== expected.from || command.to !== expected.to) {
    return fail(
      "preview_line",
      `This preview follows a scripted game. The server will accept ${expected.san} (${expected.from}–${expected.to}) here.`,
    );
  }

  settleClock(game);
  game.remainingMs.w += INCREMENT_MS;
  game.positionIndex += 1;
  game.runningSide = "b";
  game.drawOffer = null;
  bump(game);
  setTimeout(() => botReply(game), BOT_THINK_MS);
  return { ok: true, move: buildSnapshot(game).moves.at(-1) ?? null };
}

function applyPromotion(game: MockGame, command: MovePayload): Outcome {
  if (command.from !== "c7" || command.to !== "c8") {
    return fail("preview_line", "This scenario is about promotion: move the pawn from c7 to c8.");
  }
  if (!command.promotion) return fail("promotion_required", "Choose a piece to promote to.");
  settleClock(game);
  game.promotedTo = command.promotion;
  game.runningSide = "b";
  bump(game);
  setTimeout(() => {
    if (game.result) return;
    finish(game, { outcome: "white", reason: "resignation" });
    bump(game);
  }, BOT_THINK_MS);
  return { ok: true, move: buildSnapshot(game).moves.at(-1) ?? null };
}

function botReply(game: MockGame) {
  if (game.result || game.kind !== "line" || currentTurn(game) !== "b") return;
  if (demoGame.positions[game.positionIndex].ply >= LAST_SCRIPTED_PLY) return;
  settleClock(game);
  game.remainingMs.b += INCREMENT_MS;
  game.positionIndex += 1;
  game.runningSide = "w";
  bump(game);
}

function applyResign(game: MockGame): Outcome {
  if (game.result) return fail("game_finished", "This game has already finished.");
  finish(game, { outcome: "black", reason: "resignation" });
  bump(game);
  return { ok: true, move: null };
}

function applyDrawOffer(game: MockGame): Outcome {
  if (game.result) return fail("game_finished", "This game has already finished.");
  if (game.drawOffer?.state === "pending") return fail("draw_offer_pending", "A draw offer is already open.");
  game.drawOffer = { by: "w", state: "pending" };
  bump(game);
  setTimeout(() => {
    if (game.result || game.drawOffer?.state !== "pending" || game.drawOffer.by !== "w") return;
    game.drawOffer = { by: "w", state: "declined" };
    bump(game);
  }, DRAW_ANSWER_MS);
  return { ok: true, move: null };
}

function applyDrawResponse(game: MockGame, response: "accept" | "decline"): Outcome {
  if (game.result) return fail("game_finished", "This game has already finished.");
  if (game.drawOffer?.state !== "pending" || game.drawOffer.by !== "b") {
    return fail("no_draw_offer", "There's no draw offer to answer.");
  }
  if (response === "accept") finish(game, { outcome: "draw", reason: "agreement" });
  else game.drawOffer = null;
  bump(game);
  return { ok: true, move: null };
}

/** Answers a command like the server: the outcome plus the state to reconcile. */
function acknowledge(gameId: unknown, run: (game: MockGame) => Outcome): GameCommandAck {
  const game = typeof gameId === "string" && getMockSessionUser() ? getGameRoom(gameId) : null;
  if (!game) {
    return { ok: false, error: { code: "game_not_found", message: "This game doesn't exist.", retryable: false }, game: null };
  }
  const outcome = run(game);
  const snapshot = buildSnapshot(game);
  return outcome.ok
    ? { ok: true, duplicate: false, game: toUpdate(snapshot, outcome.move) }
    : { ok: false, error: { code: outcome.code, message: outcome.message, retryable: false }, game: toUpdate(snapshot, null) };
}

type CommandPayload = { gameId?: unknown } & Record<string, unknown>;
mockRealtimeClient.handleRequests("game.move", (payload) =>
  acknowledge((payload as CommandPayload).gameId, (game) => applyMove(game, payload as MovePayload)),
);
mockRealtimeClient.handleRequests("game.resign", (payload) =>
  acknowledge((payload as CommandPayload).gameId, applyResign),
);
mockRealtimeClient.handleRequests("game.draw.offer", (payload) =>
  acknowledge((payload as CommandPayload).gameId, applyDrawOffer),
);
mockRealtimeClient.handleRequests("game.draw.respond", (payload) =>
  acknowledge((payload as CommandPayload).gameId, (game) =>
    applyDrawResponse(game, (payload as { response: "accept" | "decline" }).response),
  ),
);

// ---------------------------------------------------------------------------
// Timed scenario events (?mock=draw-offer, ?mock=reconnect)
// ---------------------------------------------------------------------------

function scheduleScenarioEvents(game: MockGame) {
  if (game.kind !== "line") return;
  const scenario = getMockScenario();

  if (scenario === "draw-offer") {
    setTimeout(() => {
      if (game.result || game.drawOffer) return;
      game.drawOffer = { by: "b", state: "pending" };
      bump(game);
    }, 4_000);
  }

  if (scenario === "reconnect") {
    setTimeout(() => mockRealtimeClient.simulateDrop(3_500), 5_000);
    // An update lands while the connection is down: it is lost, and the
    // client must pick it up from a fresh snapshot after reconnecting.
    setTimeout(() => {
      game.opponent = { ...game.opponent, online: false };
      bump(game);
    }, 6_500);
  }
}

// ---------------------------------------------------------------------------
// Match chat
// ---------------------------------------------------------------------------

const chats = new Map<string, ChatMessage[]>();
const SPECTATOR_REPLIES = ["Strong centre!", "Good pace so far.", "Mind the clock!", "That's the critical line."];

export function getChat(gameId: string, now = Date.now()): ChatMessage[] {
  const existing = chats.get(gameId);
  if (existing) return existing;
  const seeded: ChatMessage[] = [
    { id: "m1", sender: { id: "user-spectator-v9", username: "Spectator_V9", role: "spectator" }, body: "Sharp line in the KID! Nd2 is critical here.", sentAt: fromNow(now, { minutes: -6 }) },
    { id: "m2", sender: { id: "user-grandmasterray", username: "GrandmasterRay", role: "spectator" }, body: "Watch out for the f5 pawn break on move 12.", sentAt: fromNow(now, { minutes: -5 }) },
    { id: "m3", sender: { id: whitePlayer.id, username: whitePlayer.username, role: "player" }, body: "Calculated. Center is fortified.", sentAt: fromNow(now, { minutes: -4 }) },
    { id: "m4", sender: { id: "system", username: "System", role: "system" }, body: "Accuracy check passed. Ping: 12ms.", sentAt: fromNow(now, { minutes: -4 }) },
  ];
  chats.set(gameId, seeded);
  return seeded;
}

export function postChatMessage(gameId: string, user: { id: string; username: string }, body: string): ChatMessage {
  const messages = getChat(gameId);
  const message: ChatMessage = {
    id: `m${messages.length + 1}-${Date.now()}`,
    sender: { id: user.id, username: user.username, role: user.id === whitePlayer.id ? "player" : "spectator" },
    body,
    sentAt: new Date().toISOString(),
  };
  messages.push(message);

  // A spectator answers a little later, delivered over the realtime channel.
  setTimeout(() => {
    const reply: ChatMessage = {
      id: `r${messages.length + 1}-${Date.now()}`,
      sender: { id: "user-grandmasterray", username: "GrandmasterRay", role: "spectator" },
      body: SPECTATOR_REPLIES[messages.length % SPECTATOR_REPLIES.length],
      sentAt: new Date().toISOString(),
    };
    messages.push(reply);
    mockRealtimeClient.publish({ channel: matchChatChannel(gameId), type: "chat.message", payload: reply });
  }, 2_200);

  return message;
}
