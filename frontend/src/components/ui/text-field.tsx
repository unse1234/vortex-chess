import { useId, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/utils/cn";

type TextFieldProps = ComponentProps<"input"> & {
  label: string;
  /** Visually hide the label while keeping it accessible. */
  hideLabel?: boolean;
  hint?: ReactNode;
  error?: string;
};

/** Labelled text input with hint and error text wired to aria-describedby. */
export function TextField({ label, hideLabel = false, hint, error, className, id, ...props }: TextFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={inputId} className={cn("text-[13px] font-semibold text-fg-muted", hideLabel && "sr-only")}>
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined}
        className={cn(
          "h-10 w-full rounded-md border bg-surface-inset px-3 text-[14px] text-fg placeholder:text-fg-subtle transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:opacity-60",
          error ? "border-danger-line" : "border-[#1f2533] focus:border-accent/60",
        )}
        {...props}
      />
      {hint ? (
        <p id={hintId} className="text-[12px] text-fg-subtle">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
