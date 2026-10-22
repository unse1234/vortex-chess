import { Skeleton } from "@/components/feedback/skeleton";

function PanelSkeleton({ className }: { className?: string }) {
  return (
    <div className={`rounded-[12px] bg-[#161b25] p-[15px] ${className ?? ""}`}>
      <Skeleton className="h-5 w-48" />
      <div className="mt-5 flex flex-col gap-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    </div>
  );
}

/** Loading placeholder shaped like the arena, so the page doesn't jump when data arrives. */
export function GameScreenSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col" aria-busy="true" aria-label="Loading game">
      <div className="flex flex-wrap items-center gap-4 px-4 pb-[18px] pt-[10px] xl:px-5 xl:pb-[25px]">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-5 w-40" />
        <Skeleton className="ml-auto h-10 w-72" />
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 px-4 pb-4 xl:grid-cols-[382px_minmax(0,1fr)_382px] xl:grid-rows-[minmax(0,1fr)] xl:gap-0 xl:px-[15px] xl:pb-[15px]">
        <div className="hidden flex-col gap-[15px] xl:flex">
          <PanelSkeleton />
          <PanelSkeleton className="flex-1" />
        </div>
        <div className="mx-auto flex w-full max-w-[675px] flex-col gap-[10px]">
          <Skeleton className="h-[84px] w-full rounded-[10px]" />
          <Skeleton className="aspect-square w-full rounded-[16px]" />
          <Skeleton className="h-[84px] w-full rounded-[10px]" />
        </div>
        <div className="hidden flex-col gap-[15px] xl:flex">
          <PanelSkeleton />
          <PanelSkeleton className="flex-1" />
        </div>
      </div>
    </div>
  );
}
