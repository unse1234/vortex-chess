import { cn } from "@/utils/cn";

export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cn("block animate-pulse rounded bg-white/[0.07]", className)} />;
}
