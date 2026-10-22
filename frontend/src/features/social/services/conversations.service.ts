import { httpClient } from "@/lib/http/browser-client";
import type {
  ConversationSummary,
  ConversationsResponse,
} from "@/features/social/types/conversation.types";

export async function getConversations(): Promise<ConversationSummary[]> {
  const { data } = await httpClient.get<ConversationsResponse>("/social/conversations");
  return data.items;
}
