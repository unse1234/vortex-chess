import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import {
  refreshSocial,
  socialRevisionOf,
  socialEventHandler,
} from "./social-sync";
import {
  socialKeys,
  playerSearchOptions,
} from "@/features/social/queries/social.queries";

describe("social authoritative recovery", () => {
  it("ignores delayed/duplicate relationship events and never applies their old rows", () => {
    const refresh = vi.fn();
    const changed = vi.fn();
    const handle = socialEventHandler(refresh, changed);
    handle({
      type: "social.updated",
      payload: { eventId: "new", revision: 5 },
    });
    handle({
      type: "social.updated",
      payload: { eventId: "old", revision: 4, items: ["removed-friend"] },
    });
    handle({
      type: "social.updated",
      payload: { eventId: "new", revision: 5 },
    });
    handle({ type: "social.updated", payload: { revision: "invalid" } });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(changed).toHaveBeenCalledTimes(1);
    handle({ type: "social.presence", payload: {} });
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(changed).toHaveBeenCalledTimes(1);
  });
  it("cancels old HTTP snapshots before recovery so removed friends cannot reappear", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    let release!: (data: string[]) => void;
    const pending = client
      .fetchQuery({
        queryKey: socialKeys.friends(""),
        queryFn: ({ signal }) => {
          signal.addEventListener("abort", vi.fn());
          return new Promise<string[]>((resolve) => {
            release = resolve;
          });
        },
      })
      .catch(() => undefined);
    await refreshSocial(client);
    client.setQueryData(socialKeys.friends(""), []);
    release(["removed-player"]);
    await pending;
    expect(client.getQueryData(socialKeys.friends(""))).toEqual([]);
    client.clear();
  });
  it("keeps search term caches distinct and requires valid bounded usernames", () => {
    expect(playerSearchOptions("alice").queryKey).not.toEqual(
      playerSearchOptions("bob").queryKey,
    );
    expect(playerSearchOptions("a").enabled).toBe(false);
    expect(playerSearchOptions("a@b").enabled).toBe(false);
    expect(playerSearchOptions("Alice_2").enabled).toBe(true);
  });
  it("accepts only valid monotonic revision values; event data never replaces cache rows", () => {
    for (const payload of [
      null,
      {},
      { revision: -1 },
      { revision: "3" },
      { revision: Infinity },
      { revision: 1.5 },
    ])
      expect(socialRevisionOf(payload)).toBeNull();
    expect(socialRevisionOf({ eventId: "stable", revision: 4 })).toBe(4);
  });
});
