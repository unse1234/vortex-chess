import { queryOptions } from "@tanstack/react-query";
import { socialKeys } from "@/features/social/queries/social.queries";
import { getMatchMessages } from "@/features/social/services/match-chat.service";

export const matchChatKeys = {
  messages: (gameId: string) => [...socialKeys.all, "match-chat", gameId] as const,
};

export function matchMessagesQueryOptions(gameId: string, options: { pollMs?: number | false } = {}) {
  return queryOptions({
    queryKey: matchChatKeys.messages(gameId),
    queryFn: () => getMatchMessages(gameId),
    refetchInterval: options.pollMs ?? false,
  });
}
