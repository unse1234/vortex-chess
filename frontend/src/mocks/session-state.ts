import type { AccountSummary } from "@/features/auth/types/session.types";
import { capabilities } from "@/config/capabilities";
import { demoAccount } from "@/mocks/fixtures/account.fixtures";

const STORAGE_KEY = "vortex-mock-session";

/**
 * The mock backend's signed-in player, kept in sessionStorage so sign-in and
 * sign-out survive reloads within the tab. Starts signed in as the demo account.
 */
export function getMockSessionUser(): AccountSummary | null {
  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    if (stored === null) return demoAccount;
    const user = JSON.parse(stored) as AccountSummary | null;
    // While sign-in isn't enforced, signing out must not lock the review build out of its data.
    return user ?? (capabilities.enforceSignIn ? null : demoAccount);
  } catch {
    return demoAccount;
  }
}

export function setMockSessionUser(user: AccountSummary | null) {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  } catch {
    // Storage can be unavailable (private mode); the session then resets on reload.
  }
}
