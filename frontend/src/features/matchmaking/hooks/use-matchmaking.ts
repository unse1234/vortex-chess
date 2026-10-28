"use client";

import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRealtimeClient, useRealtimeStatus } from "@/lib/realtime/realtime-context";
import { cancelMatchmaking, confirmMatchmaking, joinMatchmaking } from "@/features/matchmaking/services/matchmaking.service";
import { matchmakingKeys, matchmakingOptions, matchmakingStatusOptions } from "@/features/matchmaking/queries/matchmaking.queries";
import { reconcileMatchmaking, subscribeMatchmaking } from "@/features/matchmaking/realtime/matchmaking-events";
import type { MatchmakingStatus } from "@/features/matchmaking/types/matchmaking.types";

export function useMatchmaking(accountId: string) {
  const queryClient = useQueryClient();
  const query = useQuery({ ...matchmakingStatusOptions(accountId), enabled: !!accountId });
  const options = useQuery({ ...matchmakingOptions(), enabled: !!accountId });
  const cache = (status: MatchmakingStatus) => queryClient.setQueryData<MatchmakingStatus>(matchmakingKeys.status(accountId),
    (current) => reconcileMatchmaking(current, status));
  const refresh = () => queryClient.invalidateQueries({ queryKey: matchmakingKeys.status(accountId) });
  const join = useMutation({ mutationFn: joinMatchmaking, onSuccess: cache, onSettled: refresh, retry: false });
  const cancel = useMutation({ mutationFn: cancelMatchmaking, onSuccess: cache, onSettled: refresh, retry: false });
  return { query, options, join, cancel };
}

/** Mounted once for the authenticated session, including across arena navigation.
 * HTTP polling also recovers events missed across processes or reconnects. */
export function useMatchmakingSync(accountId: string, enabled: boolean) {
  const queryClient = useQueryClient();
  const realtime = useRealtimeClient();
  const connection = useRealtimeStatus(realtime);
  const query = useQuery({ ...matchmakingStatusOptions(accountId), enabled: !!accountId && enabled });
  const searchId = query.data?.searchId;
  const confirming = query.data?.state === "confirming" && !query.data.ready;

  useEffect(() => {
    if (!accountId || !enabled) return;
    const refresh = () => { void queryClient.invalidateQueries({ queryKey: matchmakingKeys.status(accountId) }); };
    const unsubscribe = realtime ? subscribeMatchmaking(realtime, refresh) : undefined;
    if (connection === "connected") refresh();
    return unsubscribe;
  }, [realtime, connection, accountId, enabled, queryClient]);

  useEffect(() => {
    if (!enabled || !accountId || !searchId || !confirming) return;
    let active = true;
    let inFlight = false;
    const confirm = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const next = await confirmMatchmaking(searchId);
        if (active) queryClient.setQueryData<MatchmakingStatus>(matchmakingKeys.status(accountId),
          (current) => reconcileMatchmaking(current, next));
      } catch {
        // A timeout has an unknown outcome; the next poll/retry recovers it.
        if (active) void queryClient.invalidateQueries({ queryKey: matchmakingKeys.status(accountId) });
      } finally { inFlight = false; }
    };
    void confirm();
    const timer = setInterval(() => void confirm(), 3000);
    return () => { active = false; clearInterval(timer); };
  }, [accountId, searchId, confirming, enabled, queryClient]);
  return query;
}
