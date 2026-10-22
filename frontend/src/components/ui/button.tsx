import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";
import { cn } from "@/utils/cn";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-[#1b1305] hover:bg-accent-strong disabled:bg-accent/40 disabled:text-[#1b1305]/60",
  secondary:
    "border border-line-strong bg-surface-raised text-fg hover:bg-surface-hover disabled:text-fg-subtle",
  ghost: "text-fg-muted hover:bg-surface-hover hover:text-fg disabled:text-fg-subtle",
  danger:
    "border border-danger-line bg-danger-soft text-[#ffbeb5] hover:bg-[#4d1020] disabled:text-[#ffbeb5]/50",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-10 px-4 text-sm",
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function Button({
  variant = "secondary",
  size = "md",
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-colors disabled:cursor-not-allowed",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    />
  );
}

type IconButtonProps = Omit<ComponentProps<"button">, "children"> & {
  /** Accessible name; also shown as a native tooltip. */
  label: string;
  icon: ReactNode;
  /** Draws an attention dot over the icon. */
  indicator?: boolean;
};

export function IconButton({
  label,
  icon,
  indicator = false,
  className,
  type = "button",
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        "relative inline-flex size-9 shrink-0 items-center justify-center rounded-md text-[24px] text-[#9aa6bd] transition-colors hover:bg-white/5 hover:text-fg sm:size-10 sm:text-[26px]",
        className,
      )}
      {...props}
    >
      {icon}
      {indicator ? (
        <span
          aria-hidden
          className="absolute right-1.5 top-1.5 size-2.5 rounded-full bg-danger ring-2 ring-chrome"
        />
      ) : null}
    </button>
  );
}
