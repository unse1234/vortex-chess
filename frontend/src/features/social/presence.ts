import type { Friend, FriendPresence } from "@/features/social/types/friend.types";

export function isOnline(presence: FriendPresence) { return presence.status === "ONLINE"; }
export function describePresence(presence: FriendPresence) {
  return isOnline(presence) ? { tone: "online" as const, label: "Online" } : { tone: "offline" as const, label: "Offline" };
}
export function groupByPresence(friends: readonly Friend[]) {
  return { online: friends.filter(f => isOnline(f.presence)), offline: friends.filter(f => !isOnline(f.presence)) };
}
