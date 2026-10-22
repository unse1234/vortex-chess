import type { ReactNode } from "react";
import Link from "next/link";
import { ComingSoon } from "@/components/display/coming-soon";
import { COMING_SOON } from "@/config/capabilities";
import { isRouteAvailable, routeFeature } from "@/config/routes";

type AppLinkProps = {
  href: string;
  destinationLabel: string;
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
};

/** Unavailable destinations have neither an href nor an activation handler. */
export function AppLink({ href, destinationLabel, className, children, ...aria }: AppLinkProps) {
  if (isRouteAvailable(href)) return <Link href={href} className={className} {...aria}>{children}</Link>;
  const feature = routeFeature(href);
  return (
    <button type="button" disabled className={className} aria-label={`${aria["aria-label"] ?? destinationLabel} - ${COMING_SOON}`}>
      {children}
      <span className="mt-1 block">{feature ? <ComingSoon feature={feature} /> : <span>{COMING_SOON}</span>}</span>
    </button>
  );
}
