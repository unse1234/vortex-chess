import type { AccountSummary } from "@/features/auth/types/session.types";

/** Credentials accepted by the mock API (any access key of 8+ characters). */
export const demoCredentials: {
  emails: readonly string[];
  minPasswordLength: number;
} = {
  emails: ["haseeb@vortex.io"],
  minPasswordLength: 8,
};

/** Call signs and emails already registered on the mock server. */
export const registeredUsernames = [
  "haseebali",
  "shadowknight",
  "chessmaster",
  "rooklover",
  "umer_farooq",
  "aliraza",
  "sanakhan",
  "talhaahmed",
];

export const registeredEmails = ["haseeb@vortex.io"];

/** Discriminator the mock server assigns to new call signs. */
export const MOCK_CALL_SIGN_TAG = "#0042";

export function createNewAccount(username: string, email: string): AccountSummary {
  return {
    id: `user-${username.toLowerCase()}`,
    username,
    avatarUrl: null,
    email,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
