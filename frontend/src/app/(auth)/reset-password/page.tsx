import type { Metadata } from "next";
import { features } from "@/config/capabilities";
import { ResetPasswordScreen } from "@/screens/auth/reset-password-screen";
import { FeatureUnavailableScreen } from "@/screens/placeholder/feature-unavailable-screen";

export const metadata: Metadata = {
  title: "Reset password",
  // Links from this page never carry its URL to other sites.
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default function Page() {
  return features.passwordRecovery.available ? (
    <ResetPasswordScreen />
  ) : (
    <FeatureUnavailableScreen feature="passwordRecovery" />
  );
}
