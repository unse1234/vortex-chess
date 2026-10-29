import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import { getConversations } from "@/features/social/services/conversations.service";
import {
  getBlockedAccounts,
  getFriendRequests,
  getFriends,
  searchPlayers,
} from "@/features/social/services/friends.service";
import { playerSearchSchema } from "@/features/social/schemas/player-search.schema";

export const socialKeys = {
  all: ["social"] as const,
  relationships: ["social", "relationships"] as const,
  friends: (search: string) =>
    ["social", "relationships", "friends", search] as const,
  search: (search: string) =>
    ["social", "relationships", "search", search] as const,
  requests: (direction: string) =>
    ["social", "relationships", "requests", direction] as const,
  blocks: ["social", "relationships", "blocks"] as const,
  conversations: () => ["social", "conversations"] as const,
};
export function friendsQueryOptions(search: string) {
  return infiniteQueryOptions({
    queryKey: socialKeys.friends(search),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      getFriends({ search, cursor: pageParam, signal }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    refetchInterval: 15000,
  });
}
export function playerSearchOptions(search: string) {
  return infiniteQueryOptions({
    queryKey: socialKeys.search(search),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      searchPlayers({ search, cursor: pageParam, signal }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: playerSearchSchema.safeParse(search).success,
  });
}
export function requestsQueryOptions(direction: "incoming" | "outgoing") {
  return infiniteQueryOptions({
    queryKey: socialKeys.requests(direction),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      getFriendRequests(direction, { cursor: pageParam, signal }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    refetchInterval: 15000,
  });
}
export function blocksQueryOptions() {
  return infiniteQueryOptions({
    queryKey: socialKeys.blocks,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      getBlockedAccounts({ cursor: pageParam, signal }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
}
export function conversationsQueryOptions() {
  return queryOptions({
    queryKey: socialKeys.conversations(),
    queryFn: getConversations,
  });
}
