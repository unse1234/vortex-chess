import type { ComponentProps } from "react";
import { SearchIcon } from "@/components/ui/icons";
import { cn } from "@/utils/cn";

type SearchInputProps = Omit<ComponentProps<"input">, "type"> & {
  /** Accessible label; the placeholder is not a substitute. */
  label: string;
  busy?: boolean;
};

export function SearchInput({ label, busy = false, className, ...props }: SearchInputProps) {
  return (
    <label className={cn("relative block", className)}>
      <span className="sr-only">{label}</span>
      <SearchIcon
        className={cn(
          "pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-xl text-fg-muted",
          busy && "animate-pulse text-accent",
        )}
      />
      <input
        type="search"
        autoComplete="off"
        spellCheck={false}
        className="h-[38px] w-full rounded-md border border-[#1f2533] bg-surface-inset pl-11 pr-3 text-[14px] text-fg placeholder:text-[#b9bcc7] transition-colors focus:border-accent/60 focus:outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        {...props}
      />
    </label>
  );
}
