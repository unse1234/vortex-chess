import type { PresenceTone } from "@/components/display/avatar";
import type { Friend, FriendPresence } from "@/features/social/types/friend.types";
import { formatRelativeTime } from "@/utils/format-relative-time";

export function isOnline(presence: FriendPresence) {
  return presence.status !== "offline";
}

const statusLabels = {
  online: "Online",
  "in-game": "Playing a game",
  "in-lobby": "In lobby",
} as const;

export function describePresence(presence: FriendPresence, now: number | null) {
  if (presence.status === "offline") {
    return {
      tone: "offline" as PresenceTone,
      label:
        presence.lastSeenAt && now !== null
          ? `Last seen ${formatRelativeTime(presence.lastSeenAt, now, "short")}`
          : "Offline",
    };
  }
  return { tone: "online" as PresenceTone, label: statusLabels[presence.status] };
}

export function groupByPresence(friends: readonly Friend[]) {
  return {
    online: friends.filter((friend) => isOnline(friend.presence)),
    offline: friends.filter((friend) => !isOnline(friend.presence)),
  };
}
