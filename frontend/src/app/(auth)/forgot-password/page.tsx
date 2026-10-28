import type { Metadata } from "next";
import { features } from "@/config/capabilities";
import { ForgotPasswordScreen } from "@/screens/auth/forgot-password-screen";
import { FeatureUnavailableScreen } from "@/screens/placeholder/feature-unavailable-screen";

export const metadata: Metadata = {
  title: "Forgot password",
};

export default function Page() {
  return features.passwordRecovery.available ? (
    <ForgotPasswordScreen />
  ) : (
    <FeatureUnavailableScreen feature="passwordRecovery" />
  );
}
