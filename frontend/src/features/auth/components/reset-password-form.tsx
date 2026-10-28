"use client";

import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import Link from "next/link";
import { ArrowForwardIcon, CheckCircleIcon, ErrorIcon, KeyIcon, LockResetIcon } from "@/components/ui/icons";
import { routes } from "@/config/routes";
import { AuthPasswordField } from "@/features/auth/components/auth-field";
import { PasswordStrengthMeter } from "@/features/auth/components/password-strength-meter";
import { RecoveryAlert, recoveryButtonClass, recoveryLinkClass } from "@/features/auth/components/recovery-feedback";
import { useResetLinkStatus, useResetPassword } from "@/features/auth/hooks/use-password-recovery";
import {
  resetPasswordSchema,
  type ResetPasswordFormValues,
} from "@/features/auth/schemas/password-recovery.schema";
import { RESET_LINK_INVALID } from "@/features/auth/services/password-recovery.service";
import { ApiError } from "@/lib/http/api-error";

function InvalidLink() {
  return (
    <div className="text-center">
      <RecoveryAlert tone="danger" icon={<ErrorIcon />}>
        This reset link is invalid, has expired or was already used.
      </RecoveryAlert>
      <Link href={routes.forgotPassword} className={recoveryButtonClass("primary", "mt-6")}>
        Request a new link
        <ArrowForwardIcon aria-hidden className="text-[24px]" />
      </Link>
      <Link href={routes.signIn} className={recoveryLinkClass("mt-6")}>
        Back to sign in
      </Link>
    </div>
  );
}

/** `token: null` means the page was opened without a usable link. */
export function ResetPasswordForm({ token }: { token: string | null }) {
  const status = useResetLinkStatus();
  const reset = useResetPassword();
  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors },
  } = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });
  const [password, confirmPassword] = useWatch({ control, name: ["password", "confirmPassword"] });
  const { mutate: checkLink } = status;

  useEffect(() => {
    if (token) checkLink(token);
  }, [token, checkLink]);

  if (!token) return <InvalidLink />;

  if (reset.isSuccess) {
    return (
      <div className="text-center">
        <RecoveryAlert tone="success" icon={<CheckCircleIcon />}>
          {reset.data.message}
        </RecoveryAlert>
        <p className="mt-4 font-body text-[14px] leading-[21px] text-auth-label">
          For your security, every device that was signed in has been signed out.
        </p>
        <Link href={routes.signIn} className={recoveryButtonClass("primary", "mt-6")}>
          Sign in
          <ArrowForwardIcon aria-hidden className="text-[24px]" />
        </Link>
      </div>
    );
  }

  const linkRejected =
    (status.data && !status.data.valid) ||
    (reset.error instanceof ApiError && reset.error.code === RESET_LINK_INVALID);
  if (linkRejected) return <InvalidLink />;

  if (status.isError) {
    return (
      <div className="text-center">
        <RecoveryAlert tone="danger">{status.error.message}</RecoveryAlert>
        <button type="button" className={recoveryButtonClass("secondary", "mx-auto mt-6")} onClick={() => checkLink(token)}>
          Try again
        </button>
      </div>
    );
  }

  if (!status.data) {
    return (
      <p role="status" className="py-6 text-center font-mono text-[14px] tracking-[0.06em] text-auth-label">
        Checking your reset link…
      </p>
    );
  }

  const submit = handleSubmit((values) => {
    if (reset.isPending) return;
    reset.mutate(
      { token, ...values },
      {
        onError: (error) => {
          for (const field of ["password", "confirmPassword"] as const) {
            const message = error.fieldErrors[field]?.[0];
            if (message) setError(field, { message });
          }
        },
      },
    );
  });
  const submitError =
    reset.error && Object.keys(reset.error.fieldErrors).length === 0 ? reset.error.message : null;

  return (
    <form noValidate onSubmit={submit}>
      <AuthPasswordField
        variant="gateway"
        label="New password"
        leadingIcon={<KeyIcon />}
        autoComplete="new-password"
        toggleClassName="text-[#c5d4c9]"
        aria-describedby="new-password-strength"
        error={errors.password?.message}
        {...register("password")}
      />
      <div className="mt-2">
        <PasswordStrengthMeter id="new-password-strength" password={password} />
      </div>
      <AuthPasswordField
        className="mt-[15px]"
        variant="gateway"
        label="Confirm new password"
        leadingIcon={<LockResetIcon />}
        autoComplete="new-password"
        toggleClassName="text-[#c5d4c9]"
        status={
          password && password === confirmPassword ? (
            <CheckCircleIcon title="Passwords match" className="text-[22px] text-auth-primary" />
          ) : null
        }
        error={errors.confirmPassword?.message}
        {...register("confirmPassword")}
      />
      <p className="mt-3 font-body text-[13px] leading-[19px] text-auth-muted">
        Use 8–128 characters. Resetting signs you out everywhere.
      </p>

      {submitError ? (
        <RecoveryAlert tone="danger" className="mt-4">
          {submitError}
        </RecoveryAlert>
      ) : null}

      <button type="submit" disabled={reset.isPending} className={recoveryButtonClass("primary", "mt-[20px]")}>
        {reset.isPending ? "Saving…" : "Set new password"}
        <ArrowForwardIcon aria-hidden className="text-[24px]" />
      </button>
    </form>
  );
}
