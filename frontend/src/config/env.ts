export const env = {
  apiBaseUrl:
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    (process.env.NODE_ENV === "development"
      ? "http://localhost:3001/api"
      : "/api"),
  /** Explicit opt-in demo only. API errors never enable mocks. */
  apiMocking: process.env.NEXT_PUBLIC_API_MOCKING === "enabled",
} as const;
