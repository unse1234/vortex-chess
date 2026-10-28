"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import Link from "next/link";
import { ArrowForwardIcon, MailIcon, ShieldPersonIcon } from "@/components/ui/icons";
import { routes } from "@/config/routes";
import { AuthField } from "@/features/auth/components/auth-field";
import { useRequestPasswordReset } from "@/features/auth/hooks/use-password-recovery";
import {
  forgotPasswordSchema,
  type ForgotPasswordFormValues,
} from "@/features/auth/schemas/password-recovery.schema";
import { RecoveryAlert, recoveryButtonClass, recoveryLinkClass } from "@/features/auth/components/recovery-feedback";

export function ForgotPasswordForm() {
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });
  const request = useRequestPasswordReset();
  const submit = handleSubmit((values) => {
    if (!request.isPending) request.mutate(values);
  });

  if (request.isSuccess) {
    return (
      <div className="text-center">
        <RecoveryAlert tone="success" icon={<MailIcon />}>
          {request.data.message}
        </RecoveryAlert>
        <p className="mt-4 font-body text-[14px] leading-[21px] text-auth-label">
          The link expires soon and works once. Check your spam folder if nothing arrives within a few minutes.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            className={recoveryButtonClass("secondary")}
            disabled={request.isPending}
            onClick={() => request.mutate({ email: getValues("email") })}
          >
            Send again
          </button>
          <button type="button" className={recoveryButtonClass("secondary")} onClick={() => request.reset()}>
            Use a different email
          </button>
        </div>
        <Link href={routes.signIn} className={recoveryLinkClass("mt-6")}>
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form noValidate onSubmit={submit}>
      <AuthField
        variant="gateway"
        label="Email"
        leadingIcon={<ShieldPersonIcon />}
        placeholder="you@example.com"
        type="email"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="none"
        spellCheck={false}
        error={errors.email?.message ?? request.error?.fieldErrors.email?.[0]}
        {...register("email")}
      />

      {request.isError ? (
        <RecoveryAlert tone="danger" className="mt-4">
          {request.error.message}
        </RecoveryAlert>
      ) : null}

      <button type="submit" disabled={request.isPending} className={recoveryButtonClass("primary", "mt-[20px]")}>
        {request.isPending ? "Sending link…" : request.isError ? "Try again" : "Send reset link"}
        <ArrowForwardIcon aria-hidden className="text-[24px]" />
      </button>

      <Link href={routes.signIn} className={recoveryLinkClass("mt-6")}>
        Back to sign in
      </Link>
    </form>
  );
}
