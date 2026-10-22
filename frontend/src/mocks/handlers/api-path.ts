import { env } from "@/config/env";

/** Full mock URL for an API path, matching what the Axios client requests. */
export function apiPath(path: string) {
  return `${env.apiBaseUrl.replace(/\/$/, "")}${path}`;
}
