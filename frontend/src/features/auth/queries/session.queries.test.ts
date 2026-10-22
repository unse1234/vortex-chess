import { expect, it } from "vitest";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import {
  replaceSessionCache,
  sessionKeys,
} from "@/features/auth/queries/session.queries";
import type { AccountSummary } from "@/features/auth/types/session.types";

it("clears private query/mutation data and notifies mounted session observers on expiry", async () => {
  const queryClient = new QueryClient();
  const account: AccountSummary = {
    id: "user",
    username: "Player",
    email: "player@example.com",
    avatarUrl: null,
    createdAt: "2026-10-22T00:00:00Z",
    updatedAt: "2026-10-22T00:00:00Z",
  };
  queryClient.setQueryData(sessionKeys.current, account);
  queryClient.setQueryData(["private", "game"], { privateData: "sensitive" });
  const observer = new QueryObserver<AccountSummary | null>(queryClient, {
    queryKey: sessionKeys.current,
    enabled: false,
  });
  const changes: unknown[] = [];
  const stop = observer.subscribe((result) => changes.push(result.data));
  const mutation = queryClient
    .getMutationCache()
    .build(queryClient, { mutationFn: async () => account });
  await mutation.execute(undefined);
  await replaceSessionCache(queryClient, null);
  expect(observer.getCurrentResult().data).toBeNull();
  expect(changes).toContain(null);
  expect(queryClient.getQueryData(["private", "game"])).toBeUndefined();
  expect(queryClient.getMutationCache().getAll()).toHaveLength(0);
  stop();
  queryClient.clear();
});
