import type { UserSummary } from "@/types/user-summary.types";

export type PresenceStatus = "online" | "in-game" | "in-lobby" | "offline";

export type FriendPresence = {
  status: PresenceStatus;
  /** When the friend was last connected; null while they are online. */
  lastSeenAt: string | null;
};

export type Friend = UserSummary & {
  presence: FriendPresence;
};

export type FriendsResponse = {
  items: Friend[];
};
