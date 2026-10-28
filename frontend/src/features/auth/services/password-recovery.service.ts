import { httpClient } from "@/lib/http/browser-client";
import { toApiError } from "@/lib/http/api-error";
import type {
  ForgotPasswordRequest,
  RecoveryMessage,
  ResetLinkStatus,
  ResetPasswordRequest,
} from "@/features/auth/types/auth.types";

/** Recovery calls never fall back to mocked or assumed success. */
async function post<T>(path: string, body: unknown): Promise<T> {
  try {
    const { data } = await httpClient.post<T>(path, body, { skipAuthentication: true });
    return data;
  } catch (error) {
    throw toApiError(error);
  }
}

/** API code for reset links that are malformed, expired, replaced or already used. */
export const RESET_LINK_INVALID = "reset_link_invalid";

/** Same outcome whether or not an account exists for the email. */
export function requestPasswordReset(request: ForgotPasswordRequest) {
  return post<RecoveryMessage>("/auth/forgot-password", request);
}

/** Read-only check: opening the link never uses it up. */
export function getResetLinkStatus(token: string) {
  return post<ResetLinkStatus>("/auth/reset-password/status", { token });
}

/** Sets the new password; every existing session ends and no new one is started. */
export function resetPassword(request: ResetPasswordRequest) {
  return post<RecoveryMessage>("/auth/reset-password", request);
}
