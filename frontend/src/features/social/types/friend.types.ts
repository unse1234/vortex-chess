import type { UserSummary } from "@/types/user-summary.types";

export type PresenceStatus = "ONLINE" | "OFFLINE";

export type FriendPresence = {
  status: PresenceStatus;
};

export type Friend = UserSummary & {
  presence: FriendPresence;
};

export type FriendsResponse = {
  items: Friend[];
  nextCursor: string | null;
  revision: number;
};

export type SocialPage<T> = {
  items: T[];
  nextCursor: string | null;
  revision: number;
};
export type Relationship = {
  state: "none" | "incoming" | "outgoing" | "friends" | "unavailable";
  requestId: string | null;
};
export type PlayerSearchResult = UserSummary & { relationship: Relationship };
export type FriendRequest = {
  id: string;
  sender: UserSummary;
  recipient: UserSummary;
  state: "PENDING" | "ACCEPTED" | "DECLINED" | "CANCELLED";
  createdAt: string;
  updatedAt: string;
};
export type BlockedAccount = UserSummary & { createdAt: string };
export type SocialAction = {
  action:
    "send" | "remove" | "block" | "unblock" | "accept" | "decline" | "cancel";
  id: string;
};
export type SocialOutcome = {
  revision: number;
  relationship: Relationship;
  request?: FriendRequest;
};
