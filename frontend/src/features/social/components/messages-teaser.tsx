import { ComingSoon } from "@/components/display/coming-soon";
import { ComposeMessageIcon } from "@/components/ui/icons";
import { features } from "@/config/capabilities";

export function MessagesTeaser() {
  return (
    <button type="button" disabled={!features.chat.available} className="flex w-full items-center gap-3 rounded-md border border-[#1f2533] bg-[#141824] px-3 py-3 text-left">
      <ComposeMessageIcon className="text-xl text-info" />
      <span className="flex-1 text-sm font-bold text-fg">Messages</span>
      <ComingSoon feature="chat" />
    </button>
  );
}
