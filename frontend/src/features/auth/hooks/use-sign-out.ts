"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { replaceSessionCache } from "@/features/auth/queries/session.queries";
import { signOut } from "@/features/auth/services/session.service";

/** Ends the session and drops every cached, user-specific server snapshot. */
export function useSignOut({ onSuccess }: { onSuccess?: () => void } = {}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: signOut,
    onSuccess: async () => {
      await replaceSessionCache(queryClient, null);
      onSuccess?.();
    },
  });
}
