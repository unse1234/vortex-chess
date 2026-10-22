"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { replaceSessionCache } from "@/features/auth/queries/session.queries";
import { signUp } from "@/features/auth/services/auth.service";
import type { AccountSummary } from "@/features/auth/types/session.types";

/** Creates the account and seeds the session cache with the new player. */
export function useSignUp({
  onSuccess,
}: { onSuccess?: (account: AccountSummary) => void } = {}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: signUp,
    onSuccess: async (account) => {
      await replaceSessionCache(queryClient, account);
      onSuccess?.(account);
    },
  });
}
