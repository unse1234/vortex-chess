"use client";

import type { ReactNode } from "react";
import { env } from "@/config/env";
import { deferRequestsUntil } from "@/lib/http/browser-client";

// Runs when the client bundle evaluates — before any component mounts — so no
// query can reach the network ahead of the mock handlers. The import stays
// inside the `typeof window` guard: the compiler removes the branch from the
// server bundle (MSW's browser entry cannot load in Node), and the mock chunk
// is only downloaded when mocking is enabled.
if (typeof window !== "undefined" && env.apiMocking) {
  deferRequestsUntil(
    import("@/mocks/browser").then(({ startMockWorker }) => startMockWorker()),
  );
}

/**
 * Development/demo API mocking boundary. Children always render; data
 * requests wait for the worker instead, keeping server-rendered markup intact.
 */
export function MockProvider({ children }: { children: ReactNode }) {
  return children;
}
