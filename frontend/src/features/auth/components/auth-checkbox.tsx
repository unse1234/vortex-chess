import type { ComponentProps, ReactNode } from "react";
import { CheckIcon } from "@/components/ui/icons";
import { cn } from "@/utils/cn";

type AuthCheckboxProps = Omit<ComponentProps<"input">, "type" | "children"> & {
  /** `signal`: solid glowing square (sign-in). `check`: square with a tick (sign-up). */
  appearance: "signal" | "check";
  children: ReactNode;
  className?: string;
};

export function AuthCheckbox({ appearance, children, className, ...inputProps }: AuthCheckboxProps) {
  return (
    <label className={cn("flex items-start", inputProps.disabled ? "cursor-not-allowed" : "cursor-pointer", className)}>
      <input type="checkbox" className="peer sr-only" {...inputProps} />
      {appearance === "signal" ? (
        <span
          aria-hidden
          className="mr-[5px] size-5 shrink-0 rounded-[3px] border border-[#3a4552] transition-colors peer-checked:border-auth-primary-strong peer-checked:bg-auth-primary-strong peer-checked:shadow-[0_0_12px_rgb(16_185_129/0.45)] peer-focus-visible:ring-2 peer-focus-visible:ring-auth-primary/70"
        />
      ) : (
        <span
          aria-hidden
          className="mr-[6px] mt-[2px] flex size-4 shrink-0 items-center justify-center rounded-[2px] border border-[#3a4552] text-[13px] text-transparent transition-colors peer-checked:border-auth-primary-strong peer-checked:bg-auth-primary-strong peer-checked:text-auth-page peer-focus-visible:ring-2 peer-focus-visible:ring-auth-primary/70"
        >
          <CheckIcon />
        </span>
      )}
      {children}
    </label>
  );
}
