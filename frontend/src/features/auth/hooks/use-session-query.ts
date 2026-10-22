"use client";

import { useQuery } from "@tanstack/react-query";
import { sessionQueryOptions } from "@/features/auth/queries/session.queries";

export function useSessionQuery() {
  return useQuery(sessionQueryOptions());
}
