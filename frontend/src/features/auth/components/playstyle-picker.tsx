import type { ComponentType } from "react";
import {
  BoltOutlineIcon,
  HierarchyIcon,
  PsychologyIcon,
  type IconProps,
} from "@/components/ui/icons";
import type { Playstyle } from "@/features/auth/types/auth.types";
import { ComingSoon } from "@/components/display/coming-soon";
import { features } from "@/config/capabilities";

const playstyles: readonly {
  value: Playstyle;
  title: string;
  description: string;
  Icon: ComponentType<IconProps>;
}[] = [
  { value: "blitz", title: "Blitz Rush", description: "Aggressive Pincer", Icon: BoltOutlineIcon },
  { value: "positional", title: "Positional", description: "Deep Precision", Icon: HierarchyIcon },
  { value: "prodigy", title: "Prodigy", description: "Hybrid Instinct", Icon: PsychologyIcon },
];

/** Deferred preference; radio inputs stay native-disabled and have no handlers. */
export function PlaystylePicker({ labelledBy }: { labelledBy: string }) {
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="grid gap-[5px] sm:grid-cols-3">
      {playstyles.map(({ value, title, description, Icon }) => (
        <label key={value} className="flex min-h-[105px] cursor-not-allowed flex-col items-center justify-center gap-2 rounded-[4px] bg-auth-field-alt text-center text-auth-text">
          <input type="radio" name="playstyle" value={value} disabled={!features.playstyle.available} className="sr-only" />
          <Icon aria-hidden className="text-[20px] text-auth-label" />
          <span className="font-mono text-sm font-bold">{title}</span>
          <span className="text-xs text-auth-muted">{description}</span>
          <ComingSoon feature="playstyle" />
        </label>
      ))}
    </div>
  );
}
