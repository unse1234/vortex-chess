import type { GamePlayer, RecentGame } from "@/features/games/types/recent-game.types";
import { demoAccount } from "@/mocks/fixtures/account.fixtures";
import { fromNow } from "@/mocks/fixtures/time";

const viewer: GamePlayer = {
  id: demoAccount.id,
  username: demoAccount.username,
  avatarUrl: demoAccount.avatarUrl,
  rating: 1192,
  ratingTier: "standard",
};

export function createRecentGames(now: number): RecentGame[] {
  return [
    {
      id: "game-7f3a21",
      result: "win",
      endedAt: fromNow(now, { minutes: -10, seconds: -40 }),
      viewer,
      opponent: {
        id: "user-shadowknight",
        username: "ShadowKnight",
        avatarUrl: "/avatars/shadow-knight.svg",
        rating: 1187,
        ratingTier: "standard",
      },
    },
    {
      id: "game-5c9e04",
      result: "loss",
      endedAt: fromNow(now, { hours: -2, minutes: -4 }),
      viewer,
      opponent: {
        id: "user-chessmaster",
        username: "ChessMaster",
        avatarUrl: "/avatars/chess-master.svg",
        rating: 1210,
        ratingTier: "elite",
      },
    },
    {
      id: "game-2b81d7",
      result: "win",
      endedAt: fromNow(now, { hours: -5, minutes: -12 }),
      viewer,
      opponent: {
        id: "user-rooklover",
        username: "RookLover",
        avatarUrl: "/avatars/rook-lover.svg",
        rating: 1175,
        ratingTier: "standard",
      },
    },
  ];
}
