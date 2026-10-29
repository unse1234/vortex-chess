import type { ConversationSummary } from "@/features/social/types/conversation.types";
import type { Friend } from "@/features/social/types/friend.types";

export function createFriends(): Friend[] {
  return [
    {
      id: "user-umer",
      username: "Umer Farooq",
      avatarUrl: "/avatars/umer-farooq.svg",
      presence: { status: "ONLINE" },
    },
    {
      id: "user-aliraza",
      username: "AliRaza",
      avatarUrl: "/avatars/ali-raza.svg",
      presence: { status: "ONLINE" },
    },
    {
      id: "user-sanakhan",
      username: "SanaKhan",
      avatarUrl: "/avatars/sana-khan.svg",
      presence: { status: "ONLINE" },
    },
    {
      id: "user-talha",
      username: "TalhaAhmed",
      avatarUrl: "/avatars/talha-ahmed.svg",
      presence: { status: "ONLINE" },
    },
    {
      id: "user-zainab",
      username: "Zainab",
      avatarUrl: "/avatars/zainab.svg",
      presence: { status: "OFFLINE" },
    },
    {
      id: "user-hamza",
      username: "HamzaMalik",
      avatarUrl: "/avatars/hamza-malik.svg",
      presence: { status: "OFFLINE" },
    },
    {
      id: "user-ayesha",
      username: "Ayesha",
      avatarUrl: "/avatars/ayesha.svg",
      presence: { status: "OFFLINE" },
    },
    {
      id: "user-faizan",
      username: "Faizan",
      avatarUrl: "/avatars/faizan.svg",
      presence: { status: "OFFLINE" },
    },
    {
      id: "user-bilal",
      username: "BilalQureshi",
      avatarUrl: null,
      presence: { status: "OFFLINE" },
    },
    {
      id: "user-maryam",
      username: "MaryamNoor",
      avatarUrl: null,
      presence: { status: "OFFLINE" },
    },
  ];
}

export const conversations: ConversationSummary[] = [];
