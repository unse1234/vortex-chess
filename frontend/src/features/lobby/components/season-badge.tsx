import { ComingSoon } from "@/components/display/coming-soon";
import { CrownIcon } from "@/components/ui/icons";

export function SeasonBadge() {
  return (
    <section aria-label="Seasons" className="inline-flex w-fit items-center gap-4 rounded-[3px] border border-[#1a1f29] bg-[#050a0d]/90 px-5 py-3.5 shadow-panel">
      <CrownIcon className="text-xl text-accent" />
      <span><span className="mb-1 block text-sm font-bold text-fg">Seasons</span><ComingSoon feature="seasons" /></span>
    </section>
  );
}
