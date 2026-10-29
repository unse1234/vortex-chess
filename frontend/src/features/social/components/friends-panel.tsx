"use client";

import { useHydrated } from "@/hooks/use-hydrated";

import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { Skeleton } from "@/components/feedback/skeleton";
import { GroupIcon, SearchIcon } from "@/components/ui/icons";
import { SearchInput } from "@/components/ui/search-input";
import { FriendGroup } from "@/features/social/components/friend-group";
import { FriendRow } from "@/features/social/components/friend-row";
import { useFriendSearch } from "@/features/social/hooks/use-friend-search";
import { groupByPresence } from "@/features/social/presence";
import type { Friend } from "@/features/social/types/friend.types";
import Link from "next/link";
import { routes } from "@/config/routes";
import { Button } from "@/components/ui/button";

type FriendsPanelProps = {
  onInviteFriend: (friend: Friend) => void;
  searchInputId?: string;
  autoFocusSearch?: boolean;
};

export function FriendsPanel({
  onInviteFriend,
  searchInputId,
  autoFocusSearch,
}: FriendsPanelProps) {
  const hydrated = useHydrated();
  const { term, setTerm, search, query, isSearching } = useFriendSearch();

  return (
    <div className="flex flex-col gap-3">
      <SearchInput
        id={searchInputId}
        label="Search friends"
        placeholder="Search friends..."
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        busy={isSearching && query.isFetching}
        data-autofocus={autoFocusSearch || undefined}
      />

      <div aria-live="polite" aria-busy={query.isPending}>
        {!hydrated || query.isPending ? (
          <FriendListSkeleton />
        ) : query.isError ? (
          <ErrorState
            title="Couldn't load friends"
            message={query.error.message}
            onRetry={() => query.refetch()}
            retrying={query.isRefetching}
          />
        ) : query.data.pages.every(page => page.items.length === 0) ? (
          search ? (
            <EmptyState
              icon={<SearchIcon />}
              title={`No friends match “${search}”`}
              description="Check the spelling or try another name."
            />
          ) : (
            <EmptyState
              icon={<GroupIcon />}
              title="No friends yet"
              description="Players you add will appear here with their online status."
            />
          )
        ) : (
          <FriendGroups
            friends={query.data.pages.flatMap(page => page.items)}
            onInviteFriend={onInviteFriend}
          />
        )}
      </div>
      {query.hasNextPage ? <Button size="sm" onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage}>Load more friends</Button> : null}
      <Link href={routes.friends} className="text-sm font-semibold text-accent hover:underline">Manage friends / Find players</Link>
    </div>
  );
}

function FriendGroups({
  friends,
  onInviteFriend,
}: {
  friends: Friend[];
  onInviteFriend: (friend: Friend) => void;
}) {
  const { online, offline } = groupByPresence(friends);
  const groups = [
    { key: "online", title: "Online", friends: online },
    { key: "offline", title: "Offline", friends: offline },
  ] as const;

  return (
    <div className="flex flex-col gap-3">
      {groups.map((group) =>
        group.friends.length > 0 ? (
          <FriendGroup
            key={group.key}
            title={group.title}
            count={group.friends.length}
            tone={group.key}
          >
            <ul className="flex flex-col">
              {group.friends.map((friend) => (
                <li key={friend.id}>
                  <FriendRow
                    friend={friend}
                    onInvite={onInviteFriend}
                  />
                </li>
              ))}
            </ul>
          </FriendGroup>
        ) : null,
      )}
    </div>
  );
}

function FriendListSkeleton() {
  return (
    <ul className="flex flex-col gap-1 pt-2" aria-label="Loading friends">
      {Array.from({ length: 6 }, (_, index) => (
        <li key={index} className="flex items-center gap-3.5 px-1.5 py-2.5">
          <Skeleton className="size-10" />
          <span className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-3 w-20" />
          </span>
        </li>
      ))}
    </ul>
  );
}
