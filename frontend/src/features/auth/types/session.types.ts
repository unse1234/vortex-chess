import type { UserSummary } from "@/types/user-summary.types";
/** Only identity fields implemented by V1 authentication. */
export type AccountSummary = UserSummary & {
  email: string;
  createdAt: string;
  updatedAt: string;
};
export type SessionResponse = { user: AccountSummary };
export type AuthResponse = SessionResponse & {
  accessToken: string;
  expiresIn: number;
};
