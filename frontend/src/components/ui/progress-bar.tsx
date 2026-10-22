import { cn } from "@/utils/cn";

type ProgressBarProps = {
  value: number;
  max: number;
  label: string;
  /** Human-readable value announced by assistive technology, e.g. "820 of 1500 XP". */
  valueText?: string;
  className?: string;
};

export function ProgressBar({ value, max, label, valueText, className }: ProgressBarProps) {
  const percent = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <span
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={valueText}
      className={cn("block h-1.5 overflow-hidden rounded-full bg-[#1e283a]", className)}
    >
      <span
        className="block h-full rounded-full bg-linear-to-r from-[#b8862f] to-accent-strong"
        style={{ width: `${percent}%` }}
      />
    </span>
  );
}
