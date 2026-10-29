import { httpClient } from "@/lib/http/browser-client";
import type {
  BlockedAccount,
  FriendRequest,
  FriendsResponse,
  PlayerSearchResult,
  SocialAction,
  SocialOutcome,
  SocialPage,
} from "@/features/social/types/friend.types";

export type PageInput = {
  search?: string;
  cursor?: string;
  signal?: AbortSignal;
};
export async function getFriends({
  signal,
  ...params
}: PageInput): Promise<FriendsResponse> {
  return (
    await httpClient.get<FriendsResponse>("/social/friends", { params, signal })
  ).data;
}
export async function searchPlayers({ signal, ...params }: PageInput) {
  return (
    await httpClient.get<SocialPage<PlayerSearchResult>>("/users/search", {
      params,
      signal,
    })
  ).data;
}
export async function getFriendRequests(
  direction: "incoming" | "outgoing",
  { signal, ...params }: PageInput,
) {
  return (
    await httpClient.get<SocialPage<FriendRequest>>("/social/requests", {
      params: { ...params, direction },
      signal,
    })
  ).data;
}
export async function getBlockedAccounts({ signal, ...params }: PageInput) {
  return (
    await httpClient.get<SocialPage<BlockedAccount>>("/social/blocks", {
      params,
      signal,
    })
  ).data;
}
export async function socialAction({
  action,
  id,
}: SocialAction): Promise<SocialOutcome> {
  switch (action) {
    case "send":
      return (
        await httpClient.post<SocialOutcome>("/social/requests", { userId: id })
      ).data;
    case "block":
      return (
        await httpClient.post<SocialOutcome>("/social/blocks", { userId: id })
      ).data;
    case "remove":
      return (
        await httpClient.delete<SocialOutcome>(
          `/social/friends/${encodeURIComponent(id)}`,
        )
      ).data;
    case "unblock":
      return (
        await httpClient.delete<SocialOutcome>(
          `/social/blocks/${encodeURIComponent(id)}`,
        )
      ).data;
    default:
      return (
        await httpClient.post<SocialOutcome>(
          `/social/requests/${encodeURIComponent(id)}/${action}`,
        )
      ).data;
  }
}
