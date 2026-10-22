"use client";

import Link from "next/link";
import { ErrorState } from "@/components/feedback/error-state";
import { routes } from "@/config/routes";

export default function GameError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <ErrorState
          title="Something went wrong in the arena"
          message="We couldn't display this game. Your game itself isn't affected."
          onRetry={retry}
          className="py-8"
        />
        <p className="mt-4 text-center">
          <Link href={routes.play} className="font-display text-[15px] font-medium text-auth-primary hover:underline">
            Back to the lobby
          </Link>
        </p>
      </div>
    </main>
  );
}
