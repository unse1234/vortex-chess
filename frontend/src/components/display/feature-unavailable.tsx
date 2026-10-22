import { ComingSoon } from "@/components/display/coming-soon";
import { features, type FeatureId } from "@/config/capabilities";
import { cn } from "@/utils/cn";

/** Static replacement: no queries, subscriptions, inputs or commands mount here. */
export function FeatureUnavailable({ feature, title, className }: { feature: FeatureId; title?: string; className?: string }) {
  return (
    <section aria-label={features[feature].label} className={cn("rounded-[12px] bg-[#161b25] p-4", className)}>
      <h2 className="font-display text-lg font-medium text-fg">{title ?? features[feature].label}</h2>
      <div className="mt-3"><ComingSoon feature={feature} /></div>
      <p className="mt-3 text-sm text-fg-muted">This feature is outside the current V1 scope.</p>
    </section>
  );
}
