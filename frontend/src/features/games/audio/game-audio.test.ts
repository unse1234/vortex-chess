import { describe, expect, it, vi } from "vitest";
import { LiveGameAudio, selectMoveCue } from "./game-audio";
import { applyGameUpdate, reconcileGameSnapshot } from "@/features/games/realtime/reconcile-game-snapshot";
import type { GameMove, GameSnapshot, GameUpdate } from "@/features/games/types/game.types";

function snapshot(): GameSnapshot {
  return {
    id: "g", roomId: "r", mode: "friends", engineTurn: null, revision: 1, ply: 0,
    fen: "initial", initialFen: "initial", status: { phase: "in-progress", turn: "w" },
    clocks: { remainingMs: { w: 1000, b: 1000 }, runningSide: "w", serverTime: 1000 },
    lastMove: null, checkSquare: null, drawOffer: null, endedAt: null, legalMoves: {},
    viewer: { role: "player", color: "w", canMove: true, canResign: true, canOfferDraw: true, canRespondToDraw: false },
    timeControl: { category: "blitz", initialMs: 180000, incrementMs: 0 },
    players: {
      w: { id: "w", username: "White", avatarUrl: null, kind: "human", online: true },
      b: { id: "b", username: "Black", avatarUrl: null, kind: "human", online: true },
    },
    moves: [], startedAt: new Date(1000).toISOString(), pgn: null,
  };
}
function update(current: GameSnapshot, overrides: Partial<GameUpdate> = {}): GameUpdate {
  const move: GameMove = {
    ply: current.ply + 1, color: current.ply % 2 ? "b" : "w", san: "e4", uci: "e2e4", from: "e2", to: "e4",
    promotion: null, captured: null, fen: "after", remainingMs: { w: 1000, b: 1000 }, elapsedMs: 0,
    playedAt: new Date(1100).toISOString(), requestId: "request-1",
  };
  return { ...current, revision: current.revision + 1, ply: move.ply, move, ...overrides };
}
function session() {
  const playback = vi.fn();
  const audio = new LiveGameAudio("g", playback);
  let current = snapshot();
  return {
    audio, playback,
    get current() { return current; },
    sync: (incoming = current) => { current = reconcileGameSnapshot(current, incoming); audio.sync(current, 1000); },
    receive: (incoming: GameUpdate, audible = true, now = 1100) => {
      const result = applyGameUpdate(current, incoming);
      if (result.kind === "applied") {
        audio.accepted(current, incoming, audible, now);
        current = result.game;
      } else if (result.kind === "gap") audio.pause();
    },
  };
}

describe("cue precedence", () => {
  it.each([
    ["e4", "moveSelf"], ["exd5", "capture"], ["exd5+", "check"], ["O-O", "castle"],
    ["O-O-O+", "check"], ["c8=Q", "promotion"], ["bxa8=Q", "promotion"], ["bxa8=Q#", "check"],
  ] as const)("selects just %s -> %s", (san, cue) => {
    expect(selectMoveCue({ san })).toBe(cue);
  });
  it("distinguishes the opponent without using board orientation", () => {
    expect(selectMoveCue({ san: "e5" }, false)).toBe("moveOpponent");
  });
});

describe("authoritative game audio", () => {
  it.each(["ack-first", "event-first"])("plays once for acknowledgement/socket duplicates: %s", () => {
    const s = session(); s.sync();
    const accepted = update(s.current);
    s.receive(accepted); s.receive(accepted); s.receive(accepted);
    s.sync(s.current); // Refetch and repeated renders carry no new accepted update.
    expect(s.playback).toHaveBeenCalledExactlyOnceWith("moveSelf", "game:g:2");
  });
  it("never sounds initial loading, history or reconnect snapshots", () => {
    const s = session();
    const incoming = update(s.current);
    s.receive(incoming); // Before the join synchronization boundary.
    s.sync({ ...s.current, revision: 10, ply: 8 });
    s.audio.pause();
    s.sync({ ...s.current, revision: 14, ply: 12 });
    s.receive({ ...incoming, revision: 14, ply: 12 });
    expect(s.playback).not.toHaveBeenCalled();
    s.receive(update(s.current));
    expect(s.playback).toHaveBeenCalledOnce();
  });
  it("suppresses rejected and duplicate command acknowledgements, including their later event", () => {
    const s = session(); s.sync();
    const incoming = update(s.current);
    s.receive(incoming, false); s.receive(incoming);
    expect(s.playback).not.toHaveBeenCalled();
  });
  it("ignores gaps until a silent synchronization boundary", () => {
    const s = session(); s.sync();
    s.receive(update(s.current, { revision: 4 }));
    s.receive(update(s.current));
    expect(s.playback).not.toHaveBeenCalled();
    s.sync({ ...s.current, revision: 4 });
    s.receive(update(s.current));
    expect(s.playback).toHaveBeenCalledOnce();
  });
  it("ignores a different game, stale updates, and events delayed after tab suspension", () => {
    const s = session(); s.sync();
    s.receive(update(s.current, { id: "other" }));
    s.receive(update(s.current, { revision: 1 }));
    s.receive(update(s.current), true, 10_000);
    expect(s.playback).not.toHaveBeenCalled();
    s.receive(update(s.current, { clocks: { ...s.current.clocks, serverTime: 10001 } }), true, 10001);
    expect(s.playback).toHaveBeenCalledOnce();
  });
  it("uses a server-clock offset rather than requiring equal device clocks", () => {
    const s = session();
    s.audio.sync(s.current, 901000);
    s.receive(update(s.current), true, 901100);
    expect(s.playback).toHaveBeenCalledOnce();
  });
  it("drops events generated before returning from a background tab, then sounds new moves", () => {
    const s = session(); s.sync();
    s.audio.discardBefore(1100);
    s.receive(update(s.current), true, 1101);
    expect(s.playback).not.toHaveBeenCalled();
    s.receive(update(s.current, { clocks: { ...s.current.clocks, serverTime: 1200 } }), true, 1200);
    expect(s.playback).toHaveBeenCalledOnce();
  });
  it.each(["white", "black", "draw", "aborted"] as const)("uses the supplied generic end sound for %s; overrides a mating capture", (outcome) => {
    const s = session(); s.sync();
    const incoming = update(s.current, { status: { phase: "finished", result: { outcome, reason: "checkmate" } } });
    incoming.move!.san = "Qxe8#";
    s.receive(incoming);
    expect(s.playback).toHaveBeenCalledExactlyOnceWith("gameEnd", "game:g:2");
  });
  it("plays results without a move, while draw offers are silent", () => {
    const s = session(); s.sync();
    s.receive(update(s.current, { move: null, ply: 0, drawOffer: { by: "b", state: "pending" } }));
    expect(s.playback).not.toHaveBeenCalled();
    s.receive(update(s.current, { move: null, ply: 0, status: { phase: "finished", result: { outcome: "draw", reason: "agreement" } } }));
    expect(s.playback).toHaveBeenCalledExactlyOnceWith("gameEnd", "game:g:3");
  });
  it("stops live announcements while the subscription is paused", () => {
    const s = session(); s.sync();
    s.audio.pause(); s.receive(update(s.current));
    expect(s.playback).not.toHaveBeenCalled();
  });
});
