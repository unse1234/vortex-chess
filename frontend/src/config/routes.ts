import { features, type FeatureId } from "@/config/capabilities";

export type MatchmakingMode = "standard";

function withQuery(path: string, query: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) params.set(key, value);
  }
  const search = params.toString();
  return search ? `${path}?${search}` : path;
}

export const routes = {
  home: "/",
  play: "/play",
  signIn: "/sign-in",
  signUp: "/sign-up",
  forgotPassword: "/forgot-password",
  terms: "/legal/terms",
  settings: "/settings",
  profile: "/profile",
  telemetry: "/telemetry",
  leaderboard: "/leaderboard",
  /** `invite` only prefills the recipient field; it grants nothing. */
  createRoom: (options: { invite?: string } = {}) =>
    withQuery("/rooms/new", { invite: options.invite }),
  room: (roomId: string) => `/rooms/${encodeURIComponent(roomId)}`,
  /** Invitation landing page; only the invited account can respond. */
  invitation: (invitationId: string) => `/rooms/join/${encodeURIComponent(invitationId)}`,
  matchmaking: (options: { mode?: MatchmakingMode } = {}) =>
    withQuery("/matchmaking", { mode: options.mode }),
  games: "/games",
  game: (gameId: string) => `/games/${encodeURIComponent(gameId)}`,
} as const;

/**
 * Routes that resolve in the current build (some are placeholders). Links to any other planned destination
 * are disabled instead of navigating to a missing page. Add a pattern
 * here when its screen lands.
 */
const availableRoutePatterns: readonly RegExp[] = [
  /^\/play$/,
  /^\/sign-in$/,
  /^\/sign-up$/,
  /^\/forgot-password$/,
  /^\/legal\/terms$/,
  /^\/settings$/,
  /^\/profile$/,
  /^\/telemetry$/,
  /^\/leaderboard$/,
  /^\/rooms\/new$/,
  /^\/rooms\/join\/[^/]+$/,
  /^\/rooms\/[^/]+$/,
  /^\/matchmaking$/,
  /^\/games$/,
  /^\/games\/[^/]+$/,
];

/**
 * Accepts only same-origin paths (e.g. a `next` parameter after sign-in) so a
 * crafted link can't redirect players to another site.
 */
export function toSafeInternalPath(
  candidate: string | null | undefined,
  fallback: string,
): string {
  if (
    !candidate ||
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\") ||
    /[\u0000-\u0020\u007f]/.test(candidate)
  ) {
    return fallback;
  }
  const parsed = new URL(candidate, "http://vortix.internal");
  if (
    parsed.origin !== "http://vortix.internal" ||
    !isRouteAvailable(parsed.pathname + parsed.search)
  )
    return fallback;
  return parsed.pathname + parsed.search + parsed.hash;
}

/** Existing deferred destinations share the same scope rules as their controls. */
export const deferredRoutes = {
  "/matchmaking": "matchmaking",
  "/leaderboard": "leaderboard",
  "/telemetry": "telemetry",
  "/profile": "profile",
  "/settings": "settings",
  "/forgot-password": "passwordRecovery",
} as const satisfies Record<string, FeatureId>;

export function routeFeature(href: string): FeatureId | undefined {
  const pathname = href.split(/[?#]/, 1)[0].replace(/\/+$/, "");
  return deferredRoutes[pathname as keyof typeof deferredRoutes];
}

export function isRouteAvailable(href: string): boolean {
  const pathname = href.split(/[?#]/, 1)[0];
  const feature = routeFeature(href);
  return (
    (!feature || features[feature].available) &&
    availableRoutePatterns.some((pattern) => pattern.test(pathname))
  );
}
