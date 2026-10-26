"use client";

import type { ReactNode } from "react";
import { BoltIcon, BoltOutlineIcon, ClockIcon, CrownIcon } from "@/components/ui/icons";
import type { TimeControlPreset } from "@/features/rooms/types/room.types";
import type { TimeControlCategory } from "@/types/time-control.types";
import { cn } from "@/utils/cn";

const categories: { id: TimeControlCategory; label: string; icon: ReactNode }[] = [
  { id: "bullet", label: "Bullet", icon: <BoltIcon /> },
  { id: "blitz", label: "Blitz", icon: <BoltOutlineIcon /> },
  { id: "rapid", label: "Rapid", icon: <ClockIcon /> },
  { id: "classical", label: "Classical", icon: <CrownIcon /> },
];

type TimeControlPickerProps = {
  name: string;
  presets: readonly TimeControlPreset[];
  value: string;
  onChange: (presetId: string) => void;
  disabled?: boolean;
};

/** Backend-supplied presets grouped by category; increments shown as "+s". */
export function TimeControlPicker({ name, presets, value, onChange, disabled = false }: TimeControlPickerProps) {
  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="text-[13px] font-bold uppercase tracking-[0.08em] text-fg-muted">Time control</legend>
      <div className="mt-3 flex flex-col gap-3">
        {categories.map((category) => {
          const options = presets.filter((preset) => preset.category === category.id);
          if (options.length === 0) return null;
          return (
            <div key={category.id} className="flex flex-wrap items-center gap-1.5">
              <span className="flex w-24 shrink-0 items-center gap-2 text-[14px] font-semibold text-fg">
                <span aria-hidden className="text-lg text-accent">{category.icon}</span>
                {category.label}
              </span>
              {options.map((preset) => {
                const checked = preset.id === value;
                return (
                  <label
                    key={preset.id}
                    className={cn(
                      "relative cursor-pointer rounded-md border px-2.5 py-1.5 font-mono text-[14px] font-semibold transition-colors has-[:disabled]:cursor-not-allowed has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent",
                      checked
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-line-strong bg-surface-raised text-fg-muted hover:text-fg",
                      disabled && !checked && "opacity-60",
                    )}
                  >
                    <input
                      type="radio"
                      name={name}
                      value={preset.id}
                      checked={checked}
                      onChange={() => onChange(preset.id)}
                      className="sr-only"
                    />
                    <span className="sr-only">{category.label} </span>
                    {preset.id}
                  </label>
                );
              })}
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
