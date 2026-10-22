"use client";

import { useState } from "react";
import { Avatar } from "@/components/display/avatar";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { Skeleton } from "@/components/feedback/skeleton";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { CheckIcon, GroupIcon } from "@/components/ui/icons";
import { SearchInput } from "@/components/ui/search-input";
import { useFriendSearch } from "@/features/social/hooks/use-friend-search";
import { describePresence, isOnline } from "@/features/social/presence";
import type { Friend } from "@/features/social/types/friend.types";
import { useNow } from "@/hooks/use-now";
import { cn } from "@/utils/cn";

type InviteFriendsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialSelectedIds?: readonly string[];
  onConfirm: (friendIds: string[]) => void;
};

/** Friend picker used to start a game with selected online friends. */
export function InviteFriendsDialog({
  open,
  onOpenChange,
  initialSelectedIds = [],
  onConfirm,
}: InviteFriendsDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Play with friends"
      description="Choose online friends to invite. They'll join you once the room is set up."
    >
      {/* Mounted only while open, so selection resets on every opening. */}
      <InviteFriendsForm
        initialSelectedIds={initialSelectedIds}
        onCancel={() => onOpenChange(false)}
        onConfirm={onConfirm}
      />
    </Dialog>
  );
}

function InviteFriendsForm({
  initialSelectedIds,
  onCancel,
  onConfirm,
}: {
  initialSelectedIds: readonly string[];
  onCancel: () => void;
  onConfirm: (friendIds: string[]) => void;
}) {
  const [selected, setSelected] = useState(() => new Set(initialSelectedIds));
  const { term, setTerm, search, query, isSearching } = useFriendSearch();
  const now = useNow();

  function toggle(friendId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(friendId)) next.delete(friendId);
      else next.add(friendId);
      return next;
    });
  }

  const friends = [...(query.data ?? [])].sort(
    (a, b) => Number(isOnline(b.presence)) - Number(isOnline(a.presence)),
  );

  return (
    <form
      className="flex h-full flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        if (selected.size > 0) onConfirm([...selected]);
      }}
    >
      <div className="border-b border-line px-5 py-3">
        <SearchInput
          label="Search friends to invite"
          placeholder="Search friends..."
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          busy={isSearching && query.isFetching}
          data-autofocus
        />
      </div>

      <fieldset className="min-h-48 px-3 py-2">
        <legend className="sr-only">Friends</legend>
        {query.isPending ? (
          <div className="flex flex-col gap-1 p-2">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-12 w-full" />
            ))}
          </div>
        ) : query.isError ? (
          <ErrorState
            className="m-2"
            title="Couldn't load friends"
            message={query.error.message}
            onRetry={() => query.refetch()}
            retrying={query.isRefetching}
          />
        ) : friends.length === 0 ? (
          <EmptyState
            icon={<GroupIcon />}
            title={search ? `No friends match “${search}”` : "No friends to invite yet"}
          />
        ) : (
          <ul className="flex flex-col">
            {friends.map((friend) => (
              <li key={friend.id}>
                <FriendOption
                  friend={friend}
                  now={now}
                  checked={selected.has(friend.id)}
                  onToggle={() => toggle(friend.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface px-5 py-4">
        <p className="mr-auto text-[13px] text-fg-muted" aria-live="polite">
          {selected.size === 0 ? "No friends selected" : `${selected.size} selected`}
        </p>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={selected.size === 0}>
          Continue to room setup
        </Button>
      </div>
    </form>
  );
}

function FriendOption({
  friend,
  now,
  checked,
  onToggle,
}: {
  friend: Friend;
  now: number | null;
  checked: boolean;
  onToggle: () => void;
}) {
  const online = isOnline(friend.presence);
  const presence = describePresence(friend.presence, now);

  return (
    <label
      className={cn(
        "flex items-center gap-3 rounded-md px-2 py-2.5 transition-colors",
        online ? "cursor-pointer hover:bg-white/[0.04]" : "cursor-not-allowed opacity-55",
        checked && "bg-accent-soft hover:bg-accent-soft",
      )}
    >
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        onChange={onToggle}
        disabled={!online}
      />
      <span
        aria-hidden
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded border text-sm peer-focus-visible:ring-2 peer-focus-visible:ring-accent",
          checked ? "border-accent bg-accent text-[#1b1305]" : "border-line-strong bg-surface-inset text-transparent",
        )}
      >
        <CheckIcon />
      </span>
      <Avatar
        src={friend.avatarUrl}
        name={friend.username}
        size={36}
        presence={online ? "online" : undefined}
        muted={!online}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium text-fg">{friend.username}</span>
        <span className={cn("block truncate text-[12px]", online ? "text-success" : "text-fg-subtle")}>
          {online ? presence.label : `${presence.label} · can't be invited`}
        </span>
      </span>
    </label>
  );
}
