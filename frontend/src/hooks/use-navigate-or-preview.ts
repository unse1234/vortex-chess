"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { isRouteAvailable } from "@/config/routes";

/** Unavailable destinations must not trigger navigation or preview toasts. */
export function useNavigateOrPreview() {
  const router = useRouter();
  const navigate = useCallback((href: string) => {
    if (isRouteAvailable(href)) router.push(href);
  }, [router]);
  return { navigate };
}
