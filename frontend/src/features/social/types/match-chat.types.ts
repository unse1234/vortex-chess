export type ChatSender = {
  id: string;
  username: string;
  role: "player" | "spectator" | "system";
};

export type ChatMessage = {
  id: string;
  sender: ChatSender;
  body: string;
  /** ISO timestamp assigned by the server. */
  sentAt: string;
};

export type MatchMessagesResponse = {
  items: ChatMessage[];
};

export type SendMatchMessageResponse = {
  message: ChatMessage;
};

export function matchChatChannel(gameId: string) {
  return `chat:match:${gameId}`;
}

export type MatchChatRealtimeEvent = { type: "chat.message"; payload: ChatMessage };
