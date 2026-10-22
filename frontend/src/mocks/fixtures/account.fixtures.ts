import type { AccountSummary } from "@/features/auth/types/session.types";
import type { Season } from "@/features/lobby/types/season.types";
import { fromNow } from "@/mocks/fixtures/time";

export const demoAccount: AccountSummary = {
  id: "user-haseeb",
  username: "HaseebAli",
  avatarUrl: "/avatars/haseeb-ali.svg",
  email: "haseeb@vortex.io",
  createdAt: "2026-10-22T00:00:00.000Z",
  updatedAt: "2026-10-22T00:00:00.000Z",
};

export function createCurrentSeason(now: number): Season {
  return {
    id: "season-1",
    number: 1,
    name: "Ranked Season",
    endsAt: fromNow(now, { days: 12, hours: 4, minutes: 30 }),
  };
}
