import type { RealtimeClient } from "@/lib/realtime/realtime-contract";
import { PERSONAL_CHANNEL } from "@/lib/realtime/realtime-contract";
import type { MatchmakingStatus } from "@/features/matchmaking/types/matchmaking.types";

export function reconcileMatchmaking(current: MatchmakingStatus | undefined, incoming: MatchmakingStatus) {
  return current && current.revision >= incoming.revision ? current : incoming;
}

/** Events invalidate authoritative HTTP state. A delayed personal event cannot
 * reintroduce an old assignment or race an HTTP fetch into the cache. */
export function subscribeMatchmaking(client: RealtimeClient, refresh: () => void) {
  return client.subscribe(PERSONAL_CHANNEL, (event) => {
    if (event.type === "matchmaking.status" || event.type === "matchmaking.found") refresh();
  });
}
