import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import { getConversations } from "@/features/social/services/conversations.service";
import { getFriends } from "@/features/social/services/friends.service";

export const socialKeys = {
  all: ["social"] as const,
  friends: (search: string) => [...socialKeys.all, "friends", { search }] as const,
  conversations: () => [...socialKeys.all, "conversations"] as const,
};

export function friendsQueryOptions(search: string) {
  return queryOptions({
    queryKey: socialKeys.friends(search),
    queryFn: () => getFriends({ search }),
    // Keep showing the previous results while a new search term loads.
    placeholderData: keepPreviousData,
  });
}

export function conversationsQueryOptions() {
  return queryOptions({
    queryKey: socialKeys.conversations(),
    queryFn: getConversations,
  });
}
