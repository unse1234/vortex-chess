import { httpClient } from "@/lib/http/browser-client";
import type { Friend, FriendsResponse } from "@/features/social/types/friend.types";

/** Lists the viewer's friends; the server filters by `search` when given. */
export async function getFriends({ search }: { search: string }): Promise<Friend[]> {
  const { data } = await httpClient.get<FriendsResponse>("/social/friends", {
    params: search ? { search } : undefined,
  });
  return data.items;
}
