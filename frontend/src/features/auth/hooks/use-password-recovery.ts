"use client";

import { useMutation } from "@tanstack/react-query";
import {
  getResetLinkStatus,
  requestPasswordReset,
  resetPassword,
} from "@/features/auth/services/password-recovery.service";
import type {
  ForgotPasswordRequest,
  RecoveryMessage,
  ResetLinkStatus,
  ResetPasswordRequest,
} from "@/features/auth/types/auth.types";
import type { ApiError } from "@/lib/http/api-error";

/*
 * Mutations rather than queries: reset tokens and passwords must never become
 * query keys or cached data. gcTime 0 drops the variables as soon as the
 * component unmounts.
 */

export function useRequestPasswordReset() {
  return useMutation<RecoveryMessage, ApiError, ForgotPasswordRequest>({ mutationFn: requestPasswordReset, gcTime: 0 });
}

export function useResetLinkStatus() {
  return useMutation<ResetLinkStatus, ApiError, string>({ mutationFn: getResetLinkStatus, gcTime: 0 });
}

/** Does not sign in: the user signs in with the new password afterwards. */
export function useResetPassword() {
  return useMutation<RecoveryMessage, ApiError, ResetPasswordRequest>({ mutationFn: resetPassword, gcTime: 0 });
}
