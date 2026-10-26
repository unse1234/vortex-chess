"use client";

import { ChessKingIcon } from "@/components/ui/icons";
import type { ColorPreference } from "@/features/rooms/types/room.types";
import { cn } from "@/utils/cn";

export const colorPreferenceLabels: Record<ColorPreference, string> = {
  white: "White",
  random: "Random",
  black: "Black",
};

const kingClass = {
  white: "text-white",
  black: "text-[#1b1f29] [filter:drop-shadow(0_0_1px_#8a93a6)]",
} as const;

function Swatch({ option }: { option: ColorPreference }) {
  if (option !== "random") return <ChessKingIcon aria-hidden className={cn("text-[28px]", kingClass[option])} />;
  return (
    <span aria-hidden className="flex items-end">
      <ChessKingIcon className={cn("text-[22px]", kingClass.white)} />
      <ChessKingIcon className={cn("-ml-1.5 text-[22px]", kingClass.black)} />
    </span>
  );
}

type ColorPreferencePickerProps = {
  name: string;
  options: readonly ColorPreference[];
  value: ColorPreference;
  onChange: (value: ColorPreference) => void;
  disabled?: boolean;
  legend?: string;
};

/** The host's side; the challenger receives the other colour. */
export function ColorPreferencePicker({ name, options, value, onChange, disabled = false, legend = "Host plays" }: ColorPreferencePickerProps) {
  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="text-[13px] font-bold uppercase tracking-[0.08em] text-fg-muted">{legend}</legend>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {options.map((option) => {
          const checked = option === value;
          return (
            <label
              key={option}
              className={cn(
                "flex cursor-pointer flex-col items-center gap-1 rounded-md border px-2 py-3 text-[14px] font-semibold transition-colors has-[:disabled]:cursor-not-allowed has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent",
                checked
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line-strong bg-surface-raised text-fg-muted hover:text-fg",
                disabled && !checked && "opacity-60",
              )}
            >
              <input
                type="radio"
                name={name}
                value={option}
                checked={checked}
                onChange={() => onChange(option)}
                className="sr-only"
              />
              <Swatch option={option} />
              {colorPreferenceLabels[option]}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
