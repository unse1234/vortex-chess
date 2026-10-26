export const env = {
  apiBaseUrl:
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    (process.env.NODE_ENV === "development"
      ? "http://localhost:3001/api"
      : "/api"),
  /** Explicit opt-in demo only. API errors never enable mocks. */
  apiMocking: process.env.NEXT_PUBLIC_API_MOCKING === "enabled",
  /** Optional Socket.IO origin; defaults to the API's origin. */
  realtimeUrl: process.env.NEXT_PUBLIC_REALTIME_URL,
} as const;

/** Socket.IO endpoint derived from the API base URL, e.g. http://localhost:3001 + /api/socket.io. */
export function realtimeEndpoint(currentOrigin: string) {
  const api = new URL(env.apiBaseUrl, currentOrigin);
  return {
    url: env.realtimeUrl ?? api.origin,
    path: `${api.pathname.replace(/\/+$/, "")}/socket.io`,
  };
}
