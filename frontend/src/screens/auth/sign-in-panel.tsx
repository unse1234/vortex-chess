"use client";

import { SignInForm } from "@/features/auth/components/sign-in-form";
import { authTelemetry } from "@/screens/auth/auth-telemetry";
import { usePostAuthRedirect } from "@/screens/auth/use-post-auth-redirect";

export function SignInPanel() {
  const continueAfterAuth = usePostAuthRedirect();
  return (
    <SignInForm
      onSignedIn={continueAfterAuth}
      systemLabel={authTelemetry.signIn.systemId}
      transportLabel={authTelemetry.signIn.transport}
    />
  );
}
