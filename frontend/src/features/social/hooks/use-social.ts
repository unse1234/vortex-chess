"use client";
import { useEffect, useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  useRealtimeClient,
  useRealtimeStatus,
} from "@/lib/realtime/realtime-context";
import { PERSONAL_CHANNEL } from "@/lib/realtime/realtime-contract";
import {
  blocksQueryOptions,
  playerSearchOptions,
  requestsQueryOptions,
} from "@/features/social/queries/social.queries";
import { socialAction } from "@/features/social/services/friends.service";
import {
  refreshSocial,
  socialEventHandler,
} from "@/features/social/realtime/social-sync";
import { playerSearchSchema } from "@/features/social/schemas/player-search.schema";

export function usePlayerSearch() {
  const [term, setTerm] = useState("");
  const search = useDebouncedValue(term.trim(), 300);
  const valid = playerSearchSchema.safeParse(search).success;
  const query = useInfiniteQuery(playerSearchOptions(search));
  return {
    term,
    setTerm,
    search,
    valid,
    settling: term.trim() !== search,
    query,
  };
}
export function useFriendRequests(direction: "incoming" | "outgoing") {
  return useInfiniteQuery(requestsQueryOptions(direction));
}
export function useBlockedAccounts() {
  return useInfiniteQuery(blocksQueryOptions());
}
export function useSocialAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: socialAction,
    retry: false,
    onSettled: () => refreshSocial(queryClient),
  });
}
export function useSocialConnection() {
  return useRealtimeStatus(useRealtimeClient());
}

/** Mounted once by the session bridge. Own tabs receive the same personal
 * invalidations; reconnect always reloads authoritative state. */
export function useSocialRealtime(enabled: boolean, onChanged?: () => void) {
  const queryClient = useQueryClient();
  const realtime = useRealtimeClient();
  const status = useRealtimeStatus(realtime);
  useEffect(() => {
    if (!enabled || !realtime) return;
    const unsubscribe = realtime.subscribe(
      PERSONAL_CHANNEL,
      socialEventHandler(() => {
        void refreshSocial(queryClient);
      }, onChanged),
    );
    if (status === "connected") {
      void refreshSocial(queryClient);
      onChanged?.();
    }
    return unsubscribe;
  }, [enabled, realtime, status, queryClient, onChanged]);
}
