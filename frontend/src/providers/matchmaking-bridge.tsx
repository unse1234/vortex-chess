"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { features } from "@/config/capabilities";
import { routes } from "@/config/routes";
import { sessionQueryOptions } from "@/features/auth/queries/session.queries";
import { useMatchmakingSync } from "@/features/matchmaking/hooks/use-matchmaking";

export function MatchmakingBridge() {
  const { data: session } = useQuery({ ...sessionQueryOptions(), enabled: false });
  const router = useRouter();
  const pathname = usePathname();
  const query = useMatchmakingSync(session?.id ?? "", features.matchmaking.available);
  const navigated = useRef<string | null>(null);
  const gameId = query.data?.state === "matched" ? query.data.gameId : null;
  useEffect(() => {
    if (!gameId) { navigated.current = null; return; }
    if (navigated.current === gameId) return;
    navigated.current = gameId;
    if (pathname !== routes.game(gameId)) router.replace(routes.game(gameId));
  }, [gameId, pathname, router]);
  return null;
}
