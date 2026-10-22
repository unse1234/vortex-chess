import { httpClient } from "@/lib/http/browser-client";
import type {
  ChatMessage,
  MatchMessagesResponse,
  SendMatchMessageResponse,
} from "@/features/social/types/match-chat.types";

const chatPath = (gameId: string) => `/games/${encodeURIComponent(gameId)}/chat`;

export async function getMatchMessages(gameId: string): Promise<ChatMessage[]> {
  const { data } = await httpClient.get<MatchMessagesResponse>(chatPath(gameId));
  return data.items;
}

export async function sendMatchMessage(gameId: string, body: string): Promise<ChatMessage> {
  const { data } = await httpClient.post<SendMatchMessageResponse>(chatPath(gameId), { body });
  return data.message;
}
