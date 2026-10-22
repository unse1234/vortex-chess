"use client";

import { SignUpForm } from "@/features/auth/components/sign-up-form";
import { usePostAuthRedirect } from "@/screens/auth/use-post-auth-redirect";

export function SignUpPanel() {
  const continueAfterAuth = usePostAuthRedirect();
  return <SignUpForm onSignedUp={continueAfterAuth} />;
}
