import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import {
  newerRead,
  positionOptions,
  reconcilePosition,
  reconcileRatings,
  ratingsOptions,
} from "@/features/ratings/queries/ratings.queries";
import type {
  LeaderboardPosition,
  RatingProfile,
  RatingsResponse,
} from "@/features/ratings/types/ratings.types";
const profile = (revision: number, rating: number): RatingProfile => ({
  pool: "blitz",
  rating,
  revision,
  peakRating: 1300,
  games: revision,
  wins: 0,
  draws: revision,
  losses: 0,
  provisional: revision < 10,
  placementsRemaining: Math.max(0, 10 - revision),
});
const response = (revision: number, rating: number): RatingsResponse => ({
  policyVersion: "elo-v1",
  items: [profile(revision, rating)],
});
const position = (revision: number, asOf: number): LeaderboardPosition => ({
  ...profile(revision, 1200),
  asOf,
  status: "ranked",
  rank: 2,
});
describe("rating reads and recovery", () => {
  it("retains settled ratings when stale or equal-revision reads arrive later", () => {
    const current = response(11, 1184);
    expect(reconcileRatings(current, response(10, 1200)).items[0]).toBe(
      current.items[0],
    );
    expect(reconcileRatings(current, response(11, 1200)).items[0]).toBe(
      current.items[0],
    );
    expect(reconcileRatings(current, response(12, 1216)).items[0].rating).toBe(
      1216,
    );
  });
  it("reconciles each pool independently", () => {
    const current = {
      ...response(11, 1184),
      items: [
        profile(11, 1184),
        { ...profile(1, 1200), pool: "rapid" as const },
      ],
    };
    const next = {
      ...response(10, 1200),
      items: [
        profile(10, 1200),
        { ...profile(2, 1216), pool: "rapid" as const },
      ],
    };
    expect(reconcileRatings(current, next).items.map((p) => p.rating)).toEqual([
      1184, 1216,
    ]);
  });
  it("guards the Query cache against an older in-flight response", async () => {
    const client = new QueryClient();
    const options = ratingsOptions("account");
    let finish!: (data: RatingsResponse) => void;
    const pending = client.fetchQuery({
      ...options,
      queryFn: () =>
        new Promise<RatingsResponse>((resolve) => {
          finish = resolve;
        }),
    });
    client.setQueryData(options.queryKey, response(11, 1184));
    finish(response(10, 1200));
    await pending;
    expect(
      client.getQueryData<RatingsResponse>(options.queryKey)?.items[0].rating,
    ).toBe(1184);
    client.clear();
  });
  it("preserves current placement against older versions and server snapshots", () => {
    const current = position(10, 100);
    expect(reconcilePosition(current, position(9, 200))).toBe(current);
    expect(reconcilePosition(current, position(10, 99))).toBe(current);
    expect(reconcilePosition(current, position(11, 50)).revision).toBe(11);
    expect(newerRead({ asOf: 100, rank: 2 }, { asOf: 99, rank: 1 }).rank).toBe(
      2,
    );
    expect(positionOptions("account", "blitz").refetchInterval).toBe(30000);
  });
});
