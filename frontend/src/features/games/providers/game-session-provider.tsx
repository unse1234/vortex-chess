"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRealtimeClient, useRealtimeStatus } from "@/lib/realtime/realtime-context";
import { useGameCommands, type GameCommands } from "@/features/games/hooks/use-game-commands";
import { gameKeys } from "@/features/games/queries/game.keys";
import { gameHistoryKeys } from "@/features/games/queries/game-history.queries";
import { gameQueryOptions } from "@/features/games/queries/game.options";
import { gameChannel, type GameRealtimeEvent } from "@/features/games/realtime/game-events.types";
import {
  applyEngineProgress,
  applyGameUpdate,
  carryReceivedAt,
  getSnapshotReceivedAt,
  reconcileGameSnapshot,
  stampSnapshotReceived,
} from "@/features/games/realtime/reconcile-game-snapshot";
import type { GameSnapshot, GameUpdate } from "@/features/games/types/game.types";

/** Without a realtime transport the game is refreshed over HTTP at this interval. */
const POLL_INTERVAL_MS = 5_000;
const RESYNC_RETRY_MS = 2_000;

/**
 * How the browser is keeping up with the game, separate from the game itself
 * (a dropped connection does not end a game, and clocks keep running).
 * - live: connected and synchronized; commands can be sent
 * - connecting: the first connection is being made
 * - polling: no realtime transport; refreshing over HTTP, read-only
 * - reconnecting: the connection dropped; moves are paused
 * - resyncing: an update was missed or the connection returned; fetching a
 *   fresh snapshot before moves resume
 */
export type GameConnection = "live" | "connecting" | "polling" | "reconnecting" | "resyncing";

type PendingSession = { status: "pending" };
type FailedSession = { status: "error"; error: Error; retry: () => void; retrying: boolean };
export type ReadySession = {
  status: "ready";
  gameId: string;
  game: GameSnapshot;
  /** Browser time the current state arrived, for clock interpolation. */
  receivedAt: number;
  connection: GameConnection;
  /** True while the connection is healthy enough to send commands. */
  connectionAllowsCommands: boolean;
  orientation: "white" | "black";
  flipBoard: () => void;
  commands: GameCommands;
  /** Local review cursor: a ply to show instead of the live position, or null for live. */
  reviewPly: number | null;
  setReviewPly: (ply: number | null) => void;
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
 * Loads one game and keeps it current. The game query cache entry is the
 * single owner of live state: HTTP snapshots, channel snapshots, compact
 * updates and command acknowledgements all reconcile into it by revision.
 * Mount it with `key={gameId}` so that local state resets when the game changes.
 */
export function GameSessionProvider({ gameId, children }: { gameId: string; children: ReactNode }) {
  const queryClient = useQueryClient();
  const realtime = useRealtimeClient();
  const realtimeStatus = useRealtimeStatus(realtime);
  const hasTransport = realtime !== null && realtimeStatus !== "idle";
  const queryKey = useMemo(() => gameKeys.detail(gameId), [gameId]);

  const query = useQuery(gameQueryOptions(gameId, { pollMs: hasTransport ? false : POLL_INTERVAL_MS }));
  const { refetch } = query;
  const [flipped, setFlipped] = useState(false);
  const [reviewPly, setReviewPly] = useState<number | null>(null);
  const [needsResync, setNeedsResync] = useState(false);
  /** Highest revision any event has shown us; the cache must reach it before moves resume. */
  const highestSeen = useRef(0);

  const resync = useCallback(() => setNeedsResync(true), []);

  const applySnapshot = useCallback(
    (snapshot: GameSnapshot) => {
      if (snapshot.id !== gameId) return;
      highestSeen.current = Math.max(highestSeen.current, snapshot.revision);
      queryClient.setQueryData<GameSnapshot>(queryKey, (current) =>
        stampSnapshotReceived(reconcileGameSnapshot(current, snapshot)),
      );
    },
    [gameId, queryClient, queryKey],
  );

  const applyUpdate = useCallback(
    (update: GameUpdate) => {
      // A late payload for a game we've navigated away from is ignored.
      if (update.id !== gameId) return;
      highestSeen.current = Math.max(highestSeen.current, update.revision);
      const result = applyGameUpdate(queryClient.getQueryData<GameSnapshot>(queryKey), update);
      if (result.kind === "applied") queryClient.setQueryData(queryKey, stampSnapshotReceived(result.game));
      else if (result.kind === "gap") resync();
    },
    [gameId, queryClient, queryKey, resync],
  );

  // Resynchronization: fetch until the cache is at least as new as anything observed.
  useEffect(() => {
    if (!needsResync) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const attempt = async () => {
      await refetch();
      if (cancelled) return;
      const cached = queryClient.getQueryData<GameSnapshot>(queryKey);
      if (cached && cached.revision >= highestSeen.current) setNeedsResync(false);
      else timer = setTimeout(() => void attempt(), RESYNC_RETRY_MS);
    };
    void attempt();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [needsResync, refetch, queryClient, queryKey]);

  useEffect(() => {
    if (!realtime) return;
    const unsubscribeEvents = realtime.subscribe(gameChannel(gameId), (event) => {
      const typed = event as unknown as GameRealtimeEvent | { type: "channel.error" | "channel.closed" };
      switch (typed.type) {
        case "game.snapshot":
          applySnapshot(typed.payload.game);
          break;
        case "game.updated":
          applyUpdate(typed.payload);
          break;
        case "game.presence": {
          const { id, userId, online } = typed.payload;
          if (id !== gameId) return;
          queryClient.setQueryData<GameSnapshot>(queryKey, (current) => {
            if (!current) return current;
            const color = current.players.w.id === userId ? "w" : current.players.b.id === userId ? "b" : null;
            if (!color || current.players[color].online === online) return current;
            const players = { ...current.players, [color]: { ...current.players[color], online } };
            return carryReceivedAt(current, { ...current, players });
          });
          break;
        }
        case "game.engine": {
          const { id, revision, engineTurn } = typed.payload;
          if (id !== gameId) return;
          queryClient.setQueryData<GameSnapshot>(queryKey, (current) =>
            current ? applyEngineProgress(current, revision, engineTurn) : current,
          );
          break;
        }
        case "channel.error":
        case "channel.closed":
          // Access changed or the subscription is uncertain: the HTTP snapshot decides.
          resync();
          break;
      }
    });

    // Events may have been missed while disconnected; every reconnect resynchronizes.
    let previous = realtime.getStatus();
    const unsubscribeStatus = realtime.onStatusChange((status) => {
      if (status === "connected" && previous === "reconnecting") resync();
      previous = status;
    });
    return () => {
      unsubscribeEvents();
      unsubscribeStatus();
    };
  }, [realtime, gameId, queryClient, queryKey, applySnapshot, applyUpdate, resync]);

  const connection: GameConnection = !hasTransport
    ? "polling"
    : realtimeStatus === "connecting"
      ? "connecting"
      : realtimeStatus === "reconnecting"
        ? "reconnecting"
        : needsResync
          ? "resyncing"
          : "live";
  const connectionAllowsCommands = connection === "live";

  const game = query.data;
  const finished = game?.status.phase === "finished";
  const missingFinalPgn = finished && game?.pgn === null;
  useEffect(() => {
    if (!finished) return;
    void queryClient.invalidateQueries({ queryKey: gameHistoryKeys.all });
    if (missingFinalPgn) void refetch();
  }, [finished, missingFinalPgn, queryClient, refetch]);
  const commands = useGameCommands({
    gameId,
    realtime,
    revision: game?.revision ?? 0,
    canSend: connectionAllowsCommands && game !== undefined,
    applyUpdate,
    resync,
  });
  const viewerColor = game?.viewer.color ?? null;
  const baseOrientation = viewerColor === "b" ? "black" : "white";

  const session = useMemo<GameSession>(() => {
    if (!game) {
      return query.isError
        ? { status: "error", error: query.error, retry: () => void refetch(), retrying: query.isFetching }
        : { status: "pending" };
    }
    return {
      status: "ready",
      gameId,
      game,
      receivedAt: getSnapshotReceivedAt(game),
      connection,
      connectionAllowsCommands,
      orientation: (baseOrientation === "black") !== flipped ? "black" : "white",
      flipBoard: () => setFlipped((current) => !current),
      commands,
      reviewPly: reviewPly !== null && reviewPly < game.ply ? reviewPly : null,
      setReviewPly,
    };
  }, [game, query.isError, query.error, query.isFetching, refetch, gameId, connection, connectionAllowsCommands, flipped, baseOrientation, commands, reviewPly]);

  return <GameSessionContext.Provider value={session}>{children}</GameSessionContext.Provider>;
}
