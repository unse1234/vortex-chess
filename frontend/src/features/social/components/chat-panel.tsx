"use client";

import { useId } from "react";
import { Avatar } from "@/components/display/avatar";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { Skeleton } from "@/components/feedback/skeleton";
import { Button } from "@/components/ui/button";
import { ArrowBackIcon, ChatBubbleIcon, SendIcon } from "@/components/ui/icons";
import { useConversationsQuery } from "@/features/social/hooks/use-conversations-query";
import type { ConversationSummary } from "@/features/social/types/conversation.types";
import { useNow } from "@/hooks/use-now";
import type { UserSummary } from "@/types/user-summary.types";
import { formatRelativeTime } from "@/utils/format-relative-time";

type ChatPanelProps = {
  activeParticipant: UserSummary | null;
  onOpenConversation: (participant: UserSummary) => void;
  onCloseConversation: () => void;
  onBrowseFriends: () => void;
};

export function ChatPanel({
  activeParticipant,
  onOpenConversation,
  onCloseConversation,
  onBrowseFriends,
}: ChatPanelProps) {
  const query = useConversationsQuery();

  if (activeParticipant) {
    const conversation = query.data?.find(
      (item) => item.participant.id === activeParticipant.id,
    );
    return (
      <ConversationView
        participant={activeParticipant}
        conversation={conversation ?? null}
        onBack={onCloseConversation}
      />
    );
  }

  if (query.isPending) {
    return (
      <ul className="flex flex-col gap-1" aria-label="Loading conversations">
        {Array.from({ length: 3 }, (_, index) => (
          <li key={index} className="flex items-center gap-3 px-1.5 py-2.5">
            <Skeleton className="size-10" />
            <span className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-3 w-40" />
            </span>
          </li>
        ))}
      </ul>
    );
  }

  if (query.isError) {
    return (
      <ErrorState
        title="Couldn't load conversations"
        message={query.error.message}
        onRetry={() => query.refetch()}
        retrying={query.isRefetching}
      />
    );
  }

  if (query.data.length === 0) {
    return (
      <EmptyState
        icon={<ChatBubbleIcon />}
        title="No conversations yet"
        description="Message a friend from your friends list and your conversations will appear here."
        action={
          <Button size="sm" onClick={onBrowseFriends}>
            Browse friends
          </Button>
        }
      />
    );
  }

  return (
    <ConversationList conversations={query.data} onOpenConversation={onOpenConversation} />
  );
}

function ConversationList({
  conversations,
  onOpenConversation,
}: {
  conversations: ConversationSummary[];
  onOpenConversation: (participant: UserSummary) => void;
}) {
  const now = useNow();
  return (
    <ul className="flex flex-col">
      {conversations.map((conversation) => (
        <li key={conversation.id}>
          <button
            type="button"
            onClick={() => onOpenConversation(conversation.participant)}
            className="flex w-full items-center gap-3 rounded-md px-1.5 py-2.5 text-left hover:bg-white/[0.03]"
          >
            <Avatar src={conversation.participant.avatarUrl} name={conversation.participant.username} size={40} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-medium text-fg">
                {conversation.participant.username}
              </span>
              <span className="block truncate text-[13px] text-fg-muted">
                {conversation.lastMessage?.body ?? "No messages yet"}
              </span>
            </span>
            {conversation.lastMessage && now !== null ? (
              <span className="text-[12px] text-fg-subtle">
                {formatRelativeTime(conversation.lastMessage.sentAt, now, "short")}
              </span>
            ) : null}
          </button>
        </li>
      ))}
    </ul>
  );
}

function ConversationView({
  participant,
  conversation,
  onBack,
}: {
  participant: UserSummary;
  conversation: ConversationSummary | null;
  onBack: () => void;
}) {
  const noticeId = useId();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to conversations"
          className="rounded-md p-1.5 text-xl text-fg-muted hover:bg-white/5 hover:text-fg"
        >
          <ArrowBackIcon />
        </button>
        <Avatar src={participant.avatarUrl} name={participant.username} size={36} />
        <h3 className="min-w-0 flex-1 truncate text-[15px] font-semibold text-fg">{participant.username}</h3>
      </div>

      <div className="rounded-md border border-line bg-surface-inset/60">
        {conversation?.lastMessage ? (
          <p className="px-4 py-6 text-[13px] text-fg-muted">{conversation.lastMessage.body}</p>
        ) : (
          <EmptyState
            title={`No messages with ${participant.username} yet`}
            description="Say hello or challenge them to a game."
          />
        )}
      </div>

      <form
        className="flex items-center gap-2"
        onSubmit={(event) => event.preventDefault()}
        aria-describedby={noticeId}
      >
        <label className="min-w-0 flex-1">
          <span className="sr-only">Message {participant.username}</span>
          <input
            disabled
            placeholder="Type a message…"
            className="h-10 w-full rounded-md border border-line bg-surface-inset px-3 text-[14px] text-fg placeholder:text-fg-subtle disabled:cursor-not-allowed"
          />
        </label>
        <Button type="submit" variant="primary" disabled aria-label="Send message" className="w-10 px-0">
          <SendIcon className="text-lg" />
        </Button>
      </form>
      <p id={noticeId} className="text-[12px] text-fg-subtle">
        Messaging isn&apos;t connected in this preview yet.
      </p>
    </div>
  );
}
