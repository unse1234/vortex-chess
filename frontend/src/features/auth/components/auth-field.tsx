"use client";

import { useId, useState, type ComponentProps, type ReactNode } from "react";
import { VisibilityIcon, VisibilityOffIcon } from "@/components/ui/icons";
import { cn } from "@/utils/cn";

/** `gateway`: sign-in console fields. `enlistment`: the denser sign-up fields. */
export type AuthFieldVariant = "gateway" | "enlistment";

const styles: Record<
  AuthFieldVariant,
  { label: string; labelRow: string; box: string; input: string; text: string; placeholder: string; leading: string }
> = {
  gateway: {
    labelRow: "mb-[3px] min-h-5 px-[5px]",
    label: "font-mono text-[13px] font-medium tracking-[0.135em] text-auth-label",
    box: "h-[52px] bg-auth-field",
    input: "px-[20px]",
    text: "text-[16.6px]",
    placeholder: "placeholder:text-auth-placeholder",
    leading: "pl-[20px] text-[22px] text-[#8d9b96]",
  },
  enlistment: {
    labelRow: "mb-[8px] min-h-5",
    label: "font-display text-[13px] font-medium tracking-[0.08em] text-auth-text",
    box: "h-[46px] bg-auth-field-alt",
    input: "px-[15px]",
    text: "text-[17px]",
    placeholder: "placeholder:text-[#a7aebb]",
    leading: "pl-[15px] text-[20px] text-auth-muted",
  },
};

type AuthFieldProps = Omit<ComponentProps<"input">, "size"> & {
  label: string;
  variant: AuthFieldVariant;
  /** Small icon before the label (enlistment fields). */
  labelIcon?: ReactNode;
  /** Content at the right end of the label row, e.g. a link or status. */
  labelAside?: ReactNode;
  /** Icon inside the field before the text. */
  leadingIcon?: ReactNode;
  /** Content inside the field after the text, e.g. a toggle or tag. */
  trailing?: ReactNode;
  error?: string;
  className?: string;
};

export function AuthField({
  label,
  variant,
  labelIcon,
  labelAside,
  leadingIcon,
  trailing,
  error,
  className,
  id,
  type = "text",
  "aria-describedby": describedBy,
  ...inputProps
}: AuthFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;
  const style = styles[variant];

  return (
    <div className={className}>
      <div className={cn("flex items-center justify-between gap-3", style.labelRow)}>
        <label htmlFor={inputId} className={cn("flex items-center gap-[6px] whitespace-nowrap uppercase", style.label)}>
          {labelIcon ? <span className="text-[17px] text-auth-primary">{labelIcon}</span> : null}
          {label}
        </label>
        {labelAside ? <span className="flex shrink-0 whitespace-nowrap">{labelAside}</span> : null}
      </div>
      <div
        className={cn(
          "flex items-center rounded-[4px] ring-1 ring-transparent transition-shadow focus-within:ring-auth-primary/55",
          error && "ring-auth-danger/60",
          style.box,
        )}
      >
        {leadingIcon ? <span aria-hidden className={cn("flex", style.leading)}>{leadingIcon}</span> : null}
        <input
          id={inputId}
          type={type}
          aria-invalid={error ? true : undefined}
          aria-describedby={[error ? errorId : null, describedBy].filter(Boolean).join(" ") || undefined}
          className={cn(
            "h-full min-w-0 flex-1 bg-transparent font-mono text-auth-text outline-none",
            style.placeholder,
            style.input,
            Boolean(leadingIcon) && variant === "gateway" && "pl-[13px]",
            style.text,
          )}
          {...inputProps}
        />
        {trailing ? <span className="flex shrink-0 items-center pr-[15px]">{trailing}</span> : null}
      </div>
      {error ? (
        <p id={errorId} className="mt-1.5 px-[2px] font-body text-[12.5px] text-auth-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

type AuthPasswordFieldProps = Omit<AuthFieldProps, "type" | "trailing"> & {
  /** Trailing status shown before the visibility toggle, e.g. a match tick. */
  status?: ReactNode;
  showToggle?: boolean;
  toggleClassName?: string;
};

/** Password field with an optional show/hide toggle. */
export function AuthPasswordField({
  status,
  showToggle = true,
  toggleClassName,
  ...props
}: AuthPasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const toggle = (
    <button
      type="button"
      onClick={() => setVisible((current) => !current)}
      aria-label={visible ? "Hide password" : "Show password"}
      aria-pressed={visible}
      className={cn("rounded p-0.5 text-[22px] transition-colors hover:text-auth-text", toggleClassName)}
    >
      {visible ? <VisibilityOffIcon /> : <VisibilityIcon />}
    </button>
  );

  return (
    <AuthField
      {...props}
      type={visible ? "text" : "password"}
      trailing={
        status || showToggle ? (
          <span className="flex items-center gap-2">
            {status}
            {showToggle ? toggle : null}
          </span>
        ) : null
      }
    />
  );
}
