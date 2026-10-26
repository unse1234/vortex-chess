import { Skeleton } from "@/components/feedback/skeleton";

/** Route fallback while params resolve; the screen shows its own loading states after. */
export function RoomRouteLoading() {
  return (
    <div className="flex flex-1 flex-col" aria-busy="true">
      <div className="h-16 border-b border-[#161b26] bg-chrome" />
      <div className="mx-auto w-full max-w-5xl px-4 py-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="mt-5 h-48 w-full" />
      </div>
    </div>
  );
}
