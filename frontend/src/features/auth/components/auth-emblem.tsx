import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

type AuthEmblemProps = {
  icon: ReactNode;
  /** Shows the green "online" pip at the bottom-right corner. */
  pip?: boolean;
  className?: string;
};

export function AuthEmblem({ icon, pip = false, className }: AuthEmblemProps) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative mx-auto flex items-center justify-center rounded-[10px] text-auth-primary shadow-[0_10px_24px_-8px_rgb(0_0_0/0.7),0_0_48px_2px_rgb(78_222_163/0.1)]",
        className,
      )}
    >
      {icon}
      {pip ? (
        <span className="absolute -bottom-[5.5px] -right-[5.5px] size-[19px] rounded-full border-4 border-[#0a0e13] bg-auth-primary" />
      ) : null}
    </span>
  );
}
