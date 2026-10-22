import Link from "next/link";
import { ErrorState } from "@/components/feedback/error-state";
import { routes } from "@/config/routes";
import { ApiError } from "@/lib/http/api-error";

type GameUnavailableProps = {
  error: Error;
  onRetry: () => void;
  retrying: boolean;
};

/** Shown when a game can't be loaded: missing, no access, or a server problem. */
export function GameUnavailable({ error, onRetry, retrying }: GameUnavailableProps) {
  // Only the game API can say a game doesn't exist; a bare 404 may just mean no API is reachable.
  const missing = error instanceof ApiError && (error.code === "game_not_found" || error.code === "forbidden");

  return (
    <main id="main-content" className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <ErrorState
          title={missing ? "Game not found" : "Couldn't load this game"}
          message={error.message}
          onRetry={missing ? undefined : onRetry}
          retrying={retrying}
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
