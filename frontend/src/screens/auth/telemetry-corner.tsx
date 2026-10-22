import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

type TelemetryCornerProps = {
  title: string;
  lines: readonly ReactNode[];
  align: "left" | "right";
  tone: "primary" | "amber";
  marker?: "dot" | "square";
  className?: string;
  /** Letter-spacing utility for the detail lines. */
  lineTracking?: string;
};

/** Decorative status readout pinned to a corner of the artwork band (wide screens only). */
export function TelemetryCorner({
  title,
  lines,
  align,
  tone,
  marker,
  className,
  lineTracking = "tracking-[0.085em]",
}: TelemetryCornerProps) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute hidden xl:block",
        align === "right" && "text-right",
        className,
      )}
    >
      <p
        className={cn(
          "flex items-center gap-[8px] font-mono text-[13px] font-bold tracking-[0.18em]",
          align === "right" && "justify-end",
          tone === "primary" ? "text-auth-primary" : "text-auth-amber",
        )}
      >
        {marker === "dot" ? <span aria-hidden className="size-[6px] rounded-full bg-current" /> : null}
        {marker === "square" ? <span aria-hidden className="-mr-[3px] size-[7px] bg-current" /> : null}
        {title}
      </p>
      {lines.map((line, index) => (
        <p key={index} className={cn("font-display text-[13px] text-auth-muted", lineTracking)}>
          {line}
        </p>
      ))}
    </div>
  );
}
