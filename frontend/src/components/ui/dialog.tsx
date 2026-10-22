"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { CloseIcon } from "@/components/ui/icons";
import { cn } from "@/utils/cn";

type DialogPlacement = "center" | "end";

const placementClasses: Record<DialogPlacement, string> = {
  center:
    "m-auto w-[min(460px,calc(100vw-2rem))] max-h-[min(680px,calc(100dvh-2rem))] rounded-lg border border-line-strong",
  end: "my-0 ml-auto mr-0 h-dvh max-h-none w-[min(380px,90vw)] border-l border-line",
};

type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  placement?: DialogPlacement;
  /** Content below the header. Only rendered while open. */
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
};

/**
 * Modal dialog built on the native <dialog> element, which provides focus
 * containment, Escape handling, an inert background and focus restoration.
 * Mark the element that should receive initial focus with `data-autofocus`;
 * otherwise the first focusable element (the close button) receives it.
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  placement = "center",
  children,
  footer,
  className,
}: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // React's `autoFocus` runs before the dialog is shown, so focus the
      // marked element once the dialog is actually open.
      dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onClose={() => onOpenChange(false)}
      onClick={(event) => {
        // Clicks on the dialog element itself land on the backdrop.
        if (event.target === event.currentTarget) onOpenChange(false);
      }}
      className={cn(
        "max-w-none bg-surface p-0 text-fg shadow-panel",
        placementClasses[placement],
        className,
      )}
    >
      {open ? (
        <div className="flex h-full max-h-[inherit] flex-col">
          <header className="flex items-start gap-3 border-b border-line px-5 py-4">
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="text-base font-bold tracking-wide text-fg">
                {title}
              </h2>
              {description ? (
                <p id={descriptionId} className="mt-1 text-[13px] leading-snug text-fg-muted">
                  {description}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="Close"
              className="-mr-1 rounded-md p-1 text-xl text-fg-subtle transition-colors hover:bg-white/5 hover:text-fg"
            >
              <CloseIcon />
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
          {footer ? (
            <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-4">
              {footer}
            </footer>
          ) : null}
        </div>
      ) : null}
    </dialog>
  );
}
