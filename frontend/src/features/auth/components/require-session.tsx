"use client";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { capabilities } from "@/config/capabilities";
import { routes } from "@/config/routes";
import { useSessionQuery } from "@/features/auth/hooks/use-session-query";
import { ApiError } from "@/lib/http/api-error";
/** Navigation UX only; the API independently authorizes every request. */
export function RequireSession() {
  const { data, error, isPending } = useSessionQuery();
  const router = useRouter();
  const pathname = usePathname();
  const signedOut =
    capabilities.enforceSignIn &&
    !isPending &&
    (data === null || (error instanceof ApiError && error.status === 401));
  useEffect(() => {
    if (signedOut) {
      const destination = pathname + window.location.search;
      router.replace(
        `${routes.signIn}?next=${encodeURIComponent(destination)}`,
      );
    }
  }, [signedOut, router, pathname]);
  return null;
}
