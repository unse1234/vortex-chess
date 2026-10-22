"use client";

import { useCallback, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRealtimeClient, useRealtimeStatus } from "@/lib/realtime/realtime-context";
import { matchChatKeys, matchMessagesQueryOptions } from "@/features/social/queries/match-chat.queries";
import { sendMatchMessage } from "@/features/social/services/match-chat.service";
import {
  matchChatChannel,
  type ChatMessage,
  type MatchChatRealtimeEvent,
} from "@/features/social/types/match-chat.types";

/** Without a realtime transport the conversation is refreshed over HTTP at this interval. */
const POLL_INTERVAL_MS = 6_000;

/** A match's chat: history over HTTP, new messages over realtime, and sending. */
export function useMatchChat(gameId: string) {
  const queryClient = useQueryClient();
  const realtime = useRealtimeClient();
  const status = useRealtimeStatus(realtime);
  const hasTransport = realtime !== null && status !== "idle";

  const query = useQuery(matchMessagesQueryOptions(gameId, { pollMs: hasTransport ? false : POLL_INTERVAL_MS }));

  // A message can arrive twice (as the send response and as a realtime event); keep one copy.
  const appendMessage = useCallback(
    (message: ChatMessage) => {
      queryClient.setQueryData<ChatMessage[]>(matchChatKeys.messages(gameId), (existing = []) =>
        existing.some((item) => item.id === message.id) ? existing : [...existing, message],
      );
    },
    [queryClient, gameId],
  );

  useEffect(() => {
    if (!realtime) return;
    return realtime.subscribe(matchChatChannel(gameId), (event) => {
      if (event.type !== "chat.message") return;
      appendMessage((event as unknown as MatchChatRealtimeEvent).payload);
    });
  }, [realtime, gameId, appendMessage]);

  const send = useMutation<ChatMessage, Error, string>({
    mutationFn: (body) => sendMatchMessage(gameId, body),
    onSuccess: appendMessage,
  });

  return { query, send };
}
