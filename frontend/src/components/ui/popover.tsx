"use client";

import { useEffect, useId, useRef, useState, type ReactNode, type Ref } from "react";
import { cn } from "@/utils/cn";

export type PopoverTriggerProps = {
  ref: Ref<HTMLButtonElement>;
  onClick: () => void;
  "aria-expanded": boolean;
  "aria-controls": string;
};

type PopoverProps = {
  /** Accessible name of the panel. */
  label: string;
  trigger: (props: PopoverTriggerProps) => ReactNode;
  children: ReactNode;
  panelClassName?: string;
};

/** Non-modal disclosure panel anchored below its trigger. */
export function Popover({ label, trigger, children, panelClassName }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={containerRef}
      className="relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      {trigger({
        ref: triggerRef,
        onClick: () => setOpen((current) => !current),
        "aria-expanded": open,
        "aria-controls": panelId,
      })}
      <div
        id={panelId}
        role="dialog"
        aria-label={label}
        hidden={!open}
        className={cn(
          "absolute right-0 top-full z-40 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-lg border border-line-strong bg-surface p-4 text-left shadow-panel",
          panelClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}
