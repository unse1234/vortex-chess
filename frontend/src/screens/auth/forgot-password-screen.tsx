import { LockResetIcon } from "@/components/ui/icons";
import { ForgotPasswordForm } from "@/features/auth/components/forgot-password-form";
import { RecoveryFrame } from "@/screens/auth/recovery-frame";

export function ForgotPasswordScreen() {
  return (
    <RecoveryFrame
      icon={<LockResetIcon className="text-[34px]" />}
      eyebrow="ACCESS KEY RECOVERY"
      title="Forgot your password?"
      description="Enter the email you signed up with and we'll send you a link to choose a new password."
    >
      <ForgotPasswordForm />
    </RecoveryFrame>
  );
}
