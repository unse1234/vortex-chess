import { httpClient } from "@/lib/http/browser-client";

type HealthResponse = { status: "ok"; region: string };

export type ApiPing = {
  latencyMs: number;
  region: string;
};

/** Measures the round trip of a lightweight health request to the API. */
export async function pingApi(): Promise<ApiPing> {
  let sentAt = performance.now();
  const { data } = await httpClient.get<HealthResponse>("/health", {
    skipAuthentication: true,
    // Runs after request interceptors, so time spent waiting on deferred
    // startup work (e.g. the mock worker) isn't counted as latency.
    transformRequest: [
      (body) => {
        sentAt = performance.now();
        return body;
      },
    ],
  });
  return {
    latencyMs: Math.round(performance.now() - sentAt),
    region: data.region,
  };
}
