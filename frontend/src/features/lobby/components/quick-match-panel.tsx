import { Panel } from "@/components/layout/panel";
import { AppLink } from "@/components/ui/app-link";
import { ComingSoon } from "@/components/display/coming-soon";
import { BoltIcon, ChevronRightIcon, GroupIcon, RoomIcon, SwordsIcon } from "@/components/ui/icons";
import { features } from "@/config/capabilities";
import { routes } from "@/config/routes";

const rowClassName = "group flex min-h-[62px] w-full items-center gap-4 rounded-md bg-surface-raised px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed";

export function QuickMatchPanel({ className }: { className?: string }) {
  return (
    <Panel title="Quick Match" icon={<BoltIcon />} className={className}>
      <ul className="flex flex-col gap-2">
        <li>
          <AppLink href={routes.matchmaking({ mode: "standard" })} destinationLabel="1v1 random matchmaking" className={rowClassName}>
            <span className="flex size-10 shrink-0 items-center justify-center rounded-md border text-xl border-line-strong bg-surface-hover text-fg-subtle"><SwordsIcon /></span>
            <span className="flex-1"><span className="block font-bold text-fg">1v1</span><span className="text-[13px] text-fg-muted">Classic Match</span></span>
          </AppLink>
        </li>
        <li>
          <button type="button" disabled={!features.team.available} className={rowClassName}>
            <span className="flex size-10 shrink-0 items-center justify-center rounded-md border text-xl border-line-strong bg-surface-hover text-fg-subtle"><GroupIcon /></span>
            <span className="flex-1"><span className="block font-bold text-fg">2v2</span><span className="text-[13px] text-fg-muted">Team Match</span></span>
            <ComingSoon feature="team" />
          </button>
        </li>
        <li>
          <AppLink href={routes.createRoom()} destinationLabel="Room setup" className={rowClassName}>
            <span className="flex size-10 shrink-0 items-center justify-center rounded-md border text-xl border-[#4d3a1f] bg-[#241e1c] text-accent"><RoomIcon /></span>
            <span className="flex-1"><span className="block font-bold text-fg">Custom Room</span><span className="text-[13px] text-fg-muted">Create &amp; Invite</span></span>
            <ChevronRightIcon className="text-lg text-fg-subtle" />
          </AppLink>
        </li>
      </ul>
    </Panel>
  );
}
