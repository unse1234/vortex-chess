import { gameChannel } from "@/features/games/realtime/game-events.types";
import type { MoveCommand } from "@/features/games/types/game-command.types";
import type {
  Color,
  DrawOffer,
  GameAnalysisState,
  GameClocks,
  GameParticipant,
  GameResult,
  GameSnapshot,
  PromotionPiece,
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

/**
 * A stand-in for the game server. Games follow precomputed lines (see
 * demo-game.data.ts) rather than a chess engine: the server accepts the
 * scripted move, "thinks" for a moment, and replies with the scripted answer.
 */

export const LIVE_GAME_ID = "vortex-demo";
export const PROMOTION_GAME_ID = "vortex-promotion";

const BOT_THINK_MS = 1_600;
const DRAW_ANSWER_MS = 1_800;
const INCREMENT_MS = 2_000;
const LAST_SCRIPTED_PLY = demoGame.positions[demoGame.positions.length - 1].ply;

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
  spectatorCount: number;
  opponent: GameParticipant;
};

const whitePlayer: GameParticipant = {
  id: demoAccount.id,
  username: demoAccount.username,
  avatarUrl: null,
  rating: 2185,
  kind: "human",
  rank: 142,
};

const botPlayer: GameParticipant = {
  id: "bot-k4sp4r",
  username: "K4SP4R_AI",
  avatarUrl: null,
  rating: 2140,
  kind: "bot",
  level: "LV.MAX",
};

const games = new Map<string, MockGame>();

export type MockFailure = { ok: false; status: number; code: string; message: string };
type Outcome = { ok: true } | MockFailure;

const fail = (status: number, code: string, message: string): MockFailure => ({ ok: false, status, code, message });

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
    spectatorCount: 48,
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
      ? { outcome: "white", reason: "resignation", ratingChange: { w: 9, b: -9 } }
      : recent.result === "loss"
        ? { outcome: "black", reason: "timeout", ratingChange: { w: -11, b: 11 } }
        : { outcome: "draw", reason: "agreement", ratingChange: { w: 0, b: 0 } };
  return {
    ...base,
    kind: "archived",
    result,
    runningSide: null,
    remainingMs: { w: 177_000, b: 70_000 },
    spectatorCount: 0,
    opponent: {
      id: recent.opponent.id,
      username: recent.opponent.username,
      avatarUrl: recent.opponent.avatarUrl,
      rating: recent.opponent.rating,
      kind: "human",
      rank: null,
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

function whiteWinProbability(centipawns: number) {
  return Math.round((50 + 50 * (2 / (1 + Math.exp(-0.00368208 * centipawns)) - 1)) * 10) / 10;
}

function analysisFor(args: {
  centipawns: number;
  materialBalance: number;
  withOpening: boolean;
}): GameAnalysisState {
  return {
    availability: "available",
    data: {
      engine: "Stockfish-NNUE-16",
      depth: 28,
      evaluation: { centipawns: args.centipawns, mateIn: null },
      whiteWinProbability: whiteWinProbability(args.centipawns),
      materialBalance: args.materialBalance,
      opening: args.withOpening
        ? { name: "King's Indian Defense", variation: "Classical Variation", eco: "E91" }
        : null,
      accuracy: 94.2,
    },
  };
}

function viewerPermissions(game: MockGame, userId: string): ViewerPermissions {
  if (userId !== whitePlayer.id) {
    return { role: "spectator", color: null, canMove: false, canResign: false, canOfferDraw: false, canRespondToDraw: false };
  }
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

export function buildSnapshot(game: MockGame, userId: string): GameSnapshot {
  const now = Date.now();
  settleClock(game, now);
  const clocks: GameClocks = {
    remainingMs: { w: game.remainingMs.w, b: game.remainingMs.b },
    runningSide: game.result ? null : game.runningSide,
    serverTime: now,
  };
  const viewer = viewerPermissions(game, userId);

  const common = {
    id: game.id,
    revision: game.revision,
    rated: true,
    timeControl: { category: "blitz", initialMs: 180_000, incrementMs: INCREMENT_MS },
    region: "EU-CENTRAL",
    spectatorCount: game.spectatorCount,
    players: { w: whitePlayer, b: game.opponent },
    clocks,
    viewer,
    drawOffer: game.drawOffer,
  } as const;

  const status: GameSnapshot["status"] = game.result
    ? { phase: "finished", result: game.result }
    : { phase: "in-progress", turn: currentTurn(game) };

  if (game.kind === "promotion") {
    const promoted = game.promotedTo ? promotionDemo.results[game.promotedTo] : null;
    return {
      ...common,
      fen: promoted?.fen ?? promotionDemo.startFen,
      status,
      moves: promoted
        ? [{ ply: 139, san: promoted.san, from: promoted.lastMove.from, to: promoted.lastMove.to, annotation: "best" }]
        : [],
      lastMove: promoted?.lastMove ?? null,
      checkSquare: promoted?.checkSquare ?? null,
      captured: { w: [], b: [] },
      legalMoves: viewer.canMove ? promotionDemo.legalMoves : {},
      analysis: analysisFor({
        centipawns: promoted ? 1450 : 940,
        materialBalance: promoted ? (game.promotedTo === "q" ? 9 : game.promotedTo === "r" ? 5 : 3) : 1,
        withOpening: false,
      }),
    };
  }

  const position = demoGame.positions[game.positionIndex];
  return {
    ...common,
    fen: position.fen,
    status,
    moves: demoGame.moves.slice(0, position.ply),
    lastMove: position.lastMove,
    checkSquare: position.checkSquare,
    captured: position.captured,
    legalMoves: viewer.canMove ? position.legalMoves : {},
    analysis: analysisFor({
      centipawns: position.evaluationCp,
      materialBalance: position.materialBalance,
      withOpening: true,
    }),
  };
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function publishSnapshot(game: MockGame) {
  const user = getMockSessionUser();
  if (!user) return;
  mockRealtimeClient.publish({
    channel: gameChannel(game.id),
    type: "game.snapshot",
    payload: buildSnapshot(game, user.id),
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
}

function requirePlayerOnMove(game: MockGame, userId: string): MockFailure | null {
  if (game.result) return fail(409, "game_finished", "This game has already finished.");
  if (userId !== whitePlayer.id || currentTurn(game) !== "w") {
    return fail(403, "not_your_turn", "It isn't your turn to move.");
  }
  return null;
}

export function applyMove(game: MockGame, userId: string, command: MoveCommand): Outcome {
  const blocked = requirePlayerOnMove(game, userId);
  if (blocked) return blocked;
  if (command.expectedRevision !== game.revision) {
    return fail(409, "stale_revision", "The position changed while you were moving. Your board has been refreshed.");
  }

  if (game.kind === "promotion") return applyPromotion(game, command);

  const position = demoGame.positions[game.positionIndex];
  if (!position.legalMoves[command.from]?.includes(command.to)) {
    return fail(422, "illegal_move", "That move isn't legal in this position.");
  }
  if (position.ply >= LAST_SCRIPTED_PLY) {
    return fail(422, "preview_line_ended", "That's the end of the scripted preview game. You can still resign or offer a draw.");
  }
  const expected = demoGame.moves[position.ply];
  if (command.from !== expected.from || command.to !== expected.to) {
    return fail(
      422,
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
  return { ok: true };
}

function applyPromotion(game: MockGame, command: MoveCommand): Outcome {
  if (command.from !== "c7" || command.to !== "c8") {
    return fail(422, "preview_line", "This scenario is about promotion: move the pawn from c7 to c8.");
  }
  if (!command.promotion) return fail(422, "illegal_move", "Choose a piece to promote to.");
  settleClock(game);
  game.promotedTo = command.promotion;
  game.runningSide = "b";
  bump(game);
  setTimeout(() => {
    if (game.result) return;
    finish(game, { outcome: "white", reason: "resignation", ratingChange: { w: 8, b: -8 } });
    bump(game);
  }, BOT_THINK_MS);
  return { ok: true };
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

export function applyResign(game: MockGame, userId: string): Outcome {
  if (game.result) return fail(409, "game_finished", "This game has already finished.");
  if (userId !== whitePlayer.id) return fail(403, "forbidden", "Only players can resign.");
  finish(game, { outcome: "black", reason: "resignation", ratingChange: { w: -12, b: 12 } });
  bump(game);
  return { ok: true };
}

export function applyDrawOffer(game: MockGame, userId: string): Outcome {
  if (game.result) return fail(409, "game_finished", "This game has already finished.");
  if (userId !== whitePlayer.id) return fail(403, "forbidden", "Only players can offer a draw.");
  if (game.drawOffer?.state === "pending") return fail(409, "draw_pending", "A draw offer is already open.");
  game.drawOffer = { by: "w", state: "pending" };
  bump(game);
  setTimeout(() => {
    if (game.result || game.drawOffer?.state !== "pending" || game.drawOffer.by !== "w") return;
    game.drawOffer = { by: "w", state: "declined" };
    bump(game);
  }, DRAW_ANSWER_MS);
  return { ok: true };
}

export function applyDrawResponse(game: MockGame, userId: string, response: "accept" | "decline"): Outcome {
  if (game.result) return fail(409, "game_finished", "This game has already finished.");
  if (userId !== whitePlayer.id) return fail(403, "forbidden", "Only players can answer a draw offer.");
  if (game.drawOffer?.state !== "pending" || game.drawOffer.by !== "b") {
    return fail(409, "no_draw_offer", "There's no draw offer to answer.");
  }
  if (response === "accept") finish(game, { outcome: "draw", reason: "agreement", ratingChange: { w: -2, b: 2 } });
  else game.drawOffer = null;
  bump(game);
  return { ok: true };
}

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
      game.spectatorCount += 3;
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
