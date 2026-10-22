import { http, HttpResponse } from "msw";
import type { ConversationsResponse } from "@/features/social/types/conversation.types";
import type { FriendsResponse } from "@/features/social/types/friend.types";
import { conversations, createFriends } from "@/mocks/fixtures/social.fixtures";
import { apiPath } from "@/mocks/handlers/api-path";
import { getMockScenario, simulateNetwork } from "@/mocks/scenarios/network";

export const socialHandlers = [
  http.get(apiPath("/social/friends"), async ({ request }) => {
    const failure = await simulateNetwork();
    if (failure) return failure;

    const search = new URL(request.url).searchParams.get("search")?.trim().toLowerCase() ?? "";
    const friends = getMockScenario() === "empty" ? [] : createFriends(Date.now());
    const items = search
      ? friends.filter((friend) => friend.username.toLowerCase().includes(search))
      : friends;

    return HttpResponse.json<FriendsResponse>({ items });
  }),

  http.get(apiPath("/social/conversations"), async () => {
    const failure = await simulateNetwork();
    if (failure) return failure;
    return HttpResponse.json<ConversationsResponse>({ items: conversations });
  }),
];
