import type { ConversationSummary } from "@/features/social/types/conversation.types";
import type { Friend } from "@/features/social/types/friend.types";
import { fromNow } from "@/mocks/fixtures/time";

export function createFriends(now: number): Friend[] {
  return [
    {
      id: "user-umer",
      username: "Umer Farooq",
      avatarUrl: "/avatars/umer-farooq.svg",
      presence: { status: "in-game", lastSeenAt: null },
    },
    {
      id: "user-aliraza",
      username: "AliRaza",
      avatarUrl: "/avatars/ali-raza.svg",
      presence: { status: "online", lastSeenAt: null },
    },
    {
      id: "user-sanakhan",
      username: "SanaKhan",
      avatarUrl: "/avatars/sana-khan.svg",
      presence: { status: "online", lastSeenAt: null },
    },
    {
      id: "user-talha",
      username: "TalhaAhmed",
      avatarUrl: "/avatars/talha-ahmed.svg",
      presence: { status: "in-lobby", lastSeenAt: null },
    },
    {
      id: "user-zainab",
      username: "Zainab",
      avatarUrl: "/avatars/zainab.svg",
      presence: { status: "offline", lastSeenAt: fromNow(now, { hours: -2, minutes: -14 }) },
    },
    {
      id: "user-hamza",
      username: "HamzaMalik",
      avatarUrl: "/avatars/hamza-malik.svg",
      presence: { status: "offline", lastSeenAt: fromNow(now, { hours: -5, minutes: -31 }) },
    },
    {
      id: "user-ayesha",
      username: "Ayesha",
      avatarUrl: "/avatars/ayesha.svg",
      presence: { status: "offline", lastSeenAt: fromNow(now, { days: -1, hours: -3 }) },
    },
    {
      id: "user-faizan",
      username: "Faizan",
      avatarUrl: "/avatars/faizan.svg",
      presence: { status: "offline", lastSeenAt: fromNow(now, { days: -2, hours: -6 }) },
    },
    {
      id: "user-bilal",
      username: "BilalQureshi",
      avatarUrl: null,
      presence: { status: "offline", lastSeenAt: fromNow(now, { days: -4, hours: -2 }) },
    },
    {
      id: "user-maryam",
      username: "MaryamNoor",
      avatarUrl: null,
      presence: { status: "offline", lastSeenAt: fromNow(now, { days: -6, hours: -9 }) },
    },
  ];
}

export const conversations: ConversationSummary[] = [];
