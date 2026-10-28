export type Playstyle = "blitz" | "positional" | "prodigy";

export type AuthProviderId = "steam" | "discord" | "google";

export type SignInRequest = {
  /** Email/password is the only supported sign-in method in V1. */
  email: string;
  password: string;
  /** Preference only; the backend decides the actual session lifetime. */
  remember: boolean;
};

export type SignUpRequest = {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
  acceptTerms: true;
};

export type UsernameAvailability = {
  username: string;
  available: boolean;
  /** Discriminator the backend would assign, e.g. "#0042". */
  tag: string | null;
};

export type ForgotPasswordRequest = { email: string };

export type ResetPasswordRequest = {
  /** Single-use credential from the emailed link; never stored or logged. */
  token: string;
  password: string;
  confirmPassword: string;
};

export type ResetLinkStatus = { valid: true; expiresAt: string } | { valid: false };

/** Message the API returns for recovery requests; never reveals whether an account exists. */
export type RecoveryMessage = { message: string };
