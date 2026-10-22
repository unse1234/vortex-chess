import type { UserSummary } from "@/types/user-summary.types";

export type ConversationSummary = {
  id: string;
  participant: UserSummary;
  lastMessage: {
    body: string;
    sentAt: string;
  } | null;
  unreadCount: number;
};

export type ConversationsResponse = {
  items: ConversationSummary[];
};
