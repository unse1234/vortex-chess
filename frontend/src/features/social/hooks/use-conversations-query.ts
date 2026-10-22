"use client";

import { useQuery } from "@tanstack/react-query";
import { conversationsQueryOptions } from "@/features/social/queries/social.queries";

export function useConversationsQuery() {
  return useQuery(conversationsQueryOptions());
}
