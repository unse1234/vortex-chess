import { COMING_SOON, features, type FeatureId } from "@/config/capabilities";
import { cn } from "@/utils/cn";

/** A textual status, including on controls that cannot receive focus. */
export function ComingSoon({ feature, className }: { feature: FeatureId; className?: string }) {
  if (features[feature].available) return null;
  return (
    <span aria-label={`${features[feature].label}: ${COMING_SOON}`} className={cn("inline-block rounded border border-current/30 px-1.5 py-0.5 text-[10px] font-semibold leading-tight tracking-normal text-fg-muted", className)}>
      {COMING_SOON}
    </span>
  );
}
