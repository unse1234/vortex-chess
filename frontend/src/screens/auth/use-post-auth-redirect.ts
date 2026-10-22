"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { routes, toSafeInternalPath } from "@/config/routes";

/** Continues to the page that sent the player to sign in, or the launcher. */
export function usePostAuthRedirect() {
  const router = useRouter();
  return useCallback(() => {
    const next = new URLSearchParams(window.location.search).get("next");
    router.replace(toSafeInternalPath(next, routes.play));
  }, [router]);
}
