import { Avatar } from "@/components/display/avatar";
import { GamepadIcon } from "@/components/ui/icons";
import { describePresence, isOnline } from "@/features/social/presence";
import type { Friend } from "@/features/social/types/friend.types";
import { cn } from "@/utils/cn";

type FriendRowProps = {
  friend: Friend;
  onInvite: (friend: Friend) => void;
};

export function FriendRow({ friend, onInvite }: FriendRowProps) {
  const online = isOnline(friend.presence);
  const presence = describePresence(friend.presence);

  return (
    <div className="group flex items-center gap-3.5 rounded-md px-1.5 py-2.5 transition-colors hover:bg-white/[0.03]">
      <Avatar
        src={friend.avatarUrl}
        name={friend.username}
        size={40}
        presence={online ? "online" : undefined}
        muted={!online}
      />
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "truncate text-[15px]",
            online ? "font-medium text-fg" : "text-[#c4c9d2]",
          )}
        >
          {friend.username}
        </p>
        <p
          className={cn(
            "flex items-center gap-1.5 truncate text-[13px]",
            online ? "text-success" : "text-fg-subtle",
          )}
        >
          {online ? (
            <span
              aria-hidden
              className="size-1.5 shrink-0 rounded-full bg-success"
            />
          ) : null}
          {presence.label}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onInvite(friend)}
        aria-label={`Invite ${friend.username} to a game`}
        title="Invite to a game"
        className="rounded-md p-1.5 text-[22px] text-[#5d6779] transition-colors hover:bg-white/5 hover:text-accent"
      >
        <GamepadIcon />
      </button>
    </div>
  );
}
