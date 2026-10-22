"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRealtimeClient, useRealtimeStatus } from "@/lib/realtime/realtime-context";
import { useGameCommands, type GameCommands } from "@/features/games/hooks/use-game-commands";
import { gameKeys } from "@/features/games/queries/game.keys";
import { gameQueryOptions } from "@/features/games/queries/game.options";
import { gameChannel, type GameRealtimeEvent } from "@/features/games/realtime/game-events.types";
import {
  getSnapshotReceivedAt,
  hasRevisionGap,
  reconcileGameSnapshot,
  stampSnapshotReceived,
} from "@/features/games/realtime/reconcile-game-snapshot";
import type { GameSnapshot } from "@/features/games/types/game.types";

/** Without a realtime transport the game is refreshed over HTTP at this interval. */
const POLL_INTERVAL_MS = 5_000;

/**
 * How the browser is keeping up with the game, separate from the game itself
 * (a dropped connection does not end a game).
 * - live: realtime events are flowing
 * - polling: no realtime transport; refreshing over HTTP
 * - reconnecting: the connection dropped; moves are paused
 * - resyncing: reconnected, fetching a fresh snapshot before moves resume
 */
export type GameConnection = "live" | "polling" | "reconnecting" | "resyncing";

type PendingSession = { status: "pending" };
type FailedSession = { status: "error"; error: Error; retry: () => void; retrying: boolean };
export type ReadySession = {
  status: "ready";
  gameId: string;
  game: GameSnapshot;
  /** Browser time the current snapshot arrived, for clock interpolation. */
  receivedAt: number;
  connection: GameConnection;
  /** True while the connection is healthy enough to send commands. */
  connectionAllowsCommands: boolean;
  orientation: "white" | "black";
  flipBoard: () => void;
  commands: GameCommands;
};

type GameSession = PendingSession | FailedSession | ReadySession;

const GameSessionContext = createContext<GameSession | null>(null);

/** Loading / error / ready state of the current game, for screens deciding what to render. */
export function useGameSessionState(): GameSession {
  const session = useContext(GameSessionContext);
  if (!session) throw new Error("useGameSessionState must be used within a GameSessionProvider");
  return session;
}

/** The loaded game. Only call below a screen that has checked the session is ready. */
export function useGameSession(): ReadySession {
  const session = useGameSessionState();
  if (session.status !== "ready") throw new Error("useGameSession needs a loaded game");
  return session;
}

/**
 * Loads one game and keeps it current: the HTTP snapshot, realtime updates
 * merged by revision, and the game-scoped UI state (board orientation, command
 * state). Mount it with `key={gameId}` so that state resets when the game changes.
 */
export function GameSessionProvider({ gameId, children }: { gameId: string; children: ReactNode }) {
  const queryClient = useQueryClient();
  const realtime = useRealtimeClient();
  const realtimeStatus = useRealtimeStatus(realtime);
  const hasTransport = realtime !== null && realtimeStatus !== "idle";

  const query = useQuery(gameQueryOptions(gameId, { pollMs: hasTransport ? false : POLL_INTERVAL_MS }));
  const commands = useGameCommands(gameId);
  const [flipped, setFlipped] = useState(false);
  const [resyncing, setResyncing] = useState(false);
  const { refetch } = query;

  useEffect(() => {
    if (!realtime) return;
    const queryKey = gameKeys.detail(gameId);

    const unsubscribeEvents = realtime.subscribe(gameChannel(gameId), (event) => {
      if (event.type !== "game.snapshot") return;
      const incoming = (event as unknown as GameRealtimeEvent).payload;
      // A late payload for a game we've navigated away from is ignored.
      if (incoming.id !== gameId) return;

      const current = queryClient.getQueryData<GameSnapshot>(queryKey);
      if (hasRevisionGap(current, incoming)) {
        // An update was missed: don't trust the cache until a fresh snapshot arrives.
        void refetch();
        return;
      }
      queryClient.setQueryData<GameSnapshot>(queryKey, (existing) =>
        stampSnapshotReceived(reconcileGameSnapshot(existing, incoming)),
      );
    });

    // Every (re)connect fetches a fresh snapshot, since events may have been missed.
    let previous = realtime.getStatus();
    const unsubscribeStatus = realtime.onStatusChange((status) => {
      if (status === "connected" && previous !== "connected") {
        const visible = previous === "reconnecting";
        if (visible) setResyncing(true);
        void refetch().finally(() => {
          if (visible) setResyncing(false);
        });
      }
      previous = status;
    });

    return () => {
      unsubscribeEvents();
      unsubscribeStatus();
    };
  }, [realtime, gameId, queryClient, refetch]);

  const connection: GameConnection = resyncing
    ? "resyncing"
    : !hasTransport || realtimeStatus === "connecting"
      ? "polling"
      : realtimeStatus === "connected"
        ? "live"
        : "reconnecting";

  const game = query.data;
  const viewerColor = game?.viewer.color ?? null;
  const baseOrientation = viewerColor === "b" ? "black" : "white";

  const session = useMemo<GameSession>(() => {
    if (!game) {
      return query.isError
        ? {
            status: "error",
            error: query.error,
            retry: () => void refetch(),
            retrying: query.isFetching,
          }
        : { status: "pending" };
    }
    return {
      status: "ready",
      gameId,
      game,
      receivedAt: getSnapshotReceivedAt(game),
      connection,
      connectionAllowsCommands: connection !== "reconnecting" && connection !== "resyncing",
      orientation: (baseOrientation === "black") !== flipped ? "black" : "white",
      flipBoard: () => setFlipped((current) => !current),
      commands,
    };
  }, [game, query.isError, query.error, query.isFetching, refetch, gameId, connection, flipped, baseOrientation, commands]);

  return <GameSessionContext.Provider value={session}>{children}</GameSessionContext.Provider>;
}
