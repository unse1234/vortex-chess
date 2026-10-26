"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { routes, toSafeInternalPath } from "@/config/routes";

const noSubscription = () => () => {};
const readNext = () => new URLSearchParams(window.location.search).get("next");

/** Sign-in/sign-up switch that keeps an allowed return destination, such as an invitation link. */
export function AuthSwitchLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  const next = useSyncExternalStore(noSubscription, readNext, () => null);
  const safe = next ? toSafeInternalPath(next, "") : "";
  const target = safe && safe !== routes.play ? `${href}?next=${encodeURIComponent(safe)}` : href;
  return (
    <Link href={target} className={className}>
      {children}
    </Link>
  );
}
