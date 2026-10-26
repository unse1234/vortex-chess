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

/** Loading placeholder shaped like the arena (board column beside the move list), so the page doesn't jump when data arrives. */
export function GameScreenSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col" aria-busy="true" aria-label="Loading game">
      <div className="flex flex-wrap items-center gap-4 px-4 pb-3 pt-[6px] xl:px-5">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-5 w-40" />
        <Skeleton className="ml-auto h-10 w-72" />
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 px-4 pb-4 xl:grid-cols-[auto_340px] xl:grid-rows-[auto_minmax(0,1fr)_auto] xl:justify-center xl:gap-x-5 xl:px-5 xl:pb-3">
        <Skeleton className="h-[68px] w-full rounded-[10px] xl:col-start-2 xl:row-start-1" />
        <Skeleton className="aspect-square w-full rounded-[10px] xl:col-start-1 xl:row-span-3 xl:row-start-1 xl:h-full xl:w-auto" />
        <Skeleton className="h-[68px] w-full rounded-[10px] xl:col-start-2 xl:row-start-3" />
        <PanelSkeleton className="hidden xl:col-start-2 xl:row-start-2 xl:block" />
      </div>
    </div>
  );
}
