"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { replaceSessionCache } from "@/features/auth/queries/session.queries";
import { signIn } from "@/features/auth/services/auth.service";
import type { AccountSummary } from "@/features/auth/types/session.types";

/** Signs in and seeds the session cache with the returned account. */
export function useSignIn({
  onSuccess,
}: { onSuccess?: (account: AccountSummary) => void } = {}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: signIn,
    onSuccess: async (account) => {
      await replaceSessionCache(queryClient, account);
      onSuccess?.(account);
    },
  });
}
