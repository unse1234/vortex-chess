"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar } from "@/components/display/avatar";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { routes } from "@/config/routes";
import { SocialActionButton } from "@/features/social/components/social-actions";
import { useFriendSearch } from "@/features/social/hooks/use-friend-search";
import {
  useBlockedAccounts,
  useFriendRequests,
  usePlayerSearch,
} from "@/features/social/hooks/use-social";
import type { UserSummary } from "@/types/user-summary.types";

type ListState = {
  isPending: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => unknown;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => unknown;
};
function ListFrame({
  query,
  count,
  empty,
  children,
}: {
  query: ListState;
  count: number;
  empty: string;
  children: ReactNode;
}) {
  return (
    <div aria-live="polite" aria-busy={query.isPending}>
      {query.isError ? (
        <div
          role="alert"
          className="my-4 rounded-lg border border-danger-line p-4"
        >
          <p>{query.error?.message}</p>
          <Button className="mt-3" onClick={() => query.refetch()}>
            Retry
          </Button>
        </div>
      ) : null}
      {query.isPending ? (
        <p className="py-8 text-fg-muted">Loading players...</p>
      ) : count === 0 ? (
        <p className="py-8 text-fg-muted">{empty}</p>
      ) : (
        <ul className="divide-y divide-line">{children}</ul>
      )}
      {query.hasNextPage ? (
        <Button
          className="mt-5"
          onClick={() => query.fetchNextPage()}
          disabled={query.isFetchingNextPage}
        >
          {query.isFetchingNextPage ? "Loading..." : "Load more"}
        </Button>
      ) : null}
    </div>
  );
}
function PlayerRow({
  player,
  detail,
  children,
}: {
  player: UserSummary;
  detail?: string;
  children: ReactNode;
}) {
  return (
    <li className="flex flex-wrap items-center gap-3 py-5">
      <Avatar src={player.avatarUrl} name={player.username} size={40} />
      <div className="min-w-0 flex-1">
        <p className="break-all font-semibold">{player.username}</p>
        {detail ? <p className="mt-1 text-sm text-fg-muted">{detail}</p> : null}
      </div>
      <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
        {children}
      </div>
    </li>
  );
}
const blockDescription =
  "This removes your friendship, cancels friend requests and pending direct game invitations, and prevents future direct interactions and random pairing. Existing games continue.";

export function ManagedFriendsList() {
  const { term, setTerm, query, isSearching } = useFriendSearch();
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <>
      <SearchInput
        label="Filter your friends by username"
        placeholder="Filter friends..."
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        busy={isSearching}
      />
      <ListFrame
        query={query}
        count={items.length}
        empty="No friends here yet. Find players to send a request."
      >
        {items.map((friend) => (
          <PlayerRow
            key={friend.id}
            player={friend}
            detail={friend.presence.status === "ONLINE" ? "Online" : "Offline"}
          >
            <Link
              href={routes.createRoom({ invite: friend.username })}
              className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-[#1b1305]"
              aria-label={`Challenge ${friend.username}`}
            >
              Challenge
            </Link>
            <SocialActionButton
              action="remove"
              id={friend.id}
              username={friend.username}
              label="Remove"
              confirm="Remove this friendship for both players? This does not block the account or cancel existing game invitations."
            />
            <SocialActionButton
              action="block"
              id={friend.id}
              username={friend.username}
              label="Block"
              confirm={blockDescription}
            />
          </PlayerRow>
        ))}
      </ListFrame>
    </>
  );
}

export function FriendRequestsList({
  direction,
}: {
  direction: "incoming" | "outgoing";
}) {
  const query = useFriendRequests(direction);
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <ListFrame
      query={query}
      count={items.length}
      empty={
        direction === "incoming"
          ? "No incoming requests."
          : "No sent requests pending."
      }
    >
      {items.map((request) => {
        const player =
          direction === "incoming" ? request.sender : request.recipient;
        return (
          <PlayerRow
            key={request.id}
            player={player}
            detail="Friend request pending"
          >
            {direction === "incoming" ? (
              <>
                <SocialActionButton
                  action="accept"
                  id={request.id}
                  username={player.username}
                  label="Accept"
                />
                <SocialActionButton
                  action="decline"
                  id={request.id}
                  username={player.username}
                  label="Decline"
                />
              </>
            ) : (
              <SocialActionButton
                action="cancel"
                id={request.id}
                username={player.username}
                label="Cancel request"
              />
            )}
            <SocialActionButton
              action="block"
              id={player.id}
              username={player.username}
              label="Block"
              confirm={blockDescription}
            />
          </PlayerRow>
        );
      })}
    </ListFrame>
  );
}

export function FindPlayersList() {
  const { term, setTerm, query, valid, settling } = usePlayerSearch();
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <>
      <SearchInput
        label="Find players by username"
        placeholder="Enter at least 2 username characters"
        value={term}
        maxLength={20}
        onChange={(e) => setTerm(e.target.value)}
        busy={settling || query.isFetching}
      />
      <p className="mt-2 text-xs text-fg-subtle">
        Search the start of a username. Letters, numbers and underscores only.
      </p>
      {settling ? (
        <p className="py-8 text-fg-muted">Searching...</p>
      ) : !valid ? (
        <p className="py-8 text-fg-muted">
          Enter 2–20 username characters to search.
        </p>
      ) : (
        <ListFrame
          query={query}
          count={items.length}
          empty="No players match this username."
        >
          {items.map((player) => (
            <PlayerRow key={player.id} player={player}>
              {player.relationship.state === "none" ? (
                <SocialActionButton
                  action="send"
                  id={player.id}
                  username={player.username}
                  label="Add Friend"
                />
              ) : null}
              {player.relationship.state === "friends" ? (
                <span className="text-sm text-success">Friends</span>
              ) : null}
              {player.relationship.state === "outgoing" ? (
                <span className="text-sm text-fg-muted">Pending</span>
              ) : null}
              {player.relationship.state === "incoming" &&
              player.relationship.requestId ? (
                <>
                  <SocialActionButton
                    action="accept"
                    id={player.relationship.requestId}
                    username={player.username}
                    label="Accept"
                  />
                  <SocialActionButton
                    action="decline"
                    id={player.relationship.requestId}
                    username={player.username}
                    label="Decline"
                  />
                </>
              ) : null}
              <SocialActionButton
                action="block"
                id={player.id}
                username={player.username}
                label="Block"
                confirm={blockDescription}
              />
            </PlayerRow>
          ))}
        </ListFrame>
      )}
    </>
  );
}

export function BlockedAccountsList() {
  const query = useBlockedAccounts();
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <ListFrame
      query={query}
      count={items.length}
      empty="You have no blocked accounts."
    >
      {items.map((player) => (
        <PlayerRow key={player.id} player={player}>
          <SocialActionButton
            action="unblock"
            id={player.id}
            username={player.username}
            label="Unblock"
            confirm="Unblocking allows future interactions when available. It does not restore friendships, requests or game invitations."
          />
        </PlayerRow>
      ))}
    </ListFrame>
  );
}
