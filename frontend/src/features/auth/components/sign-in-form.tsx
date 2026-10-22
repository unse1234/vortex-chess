"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { AppLink } from "@/components/ui/app-link";
import { ArrowForwardIcon, KeyIcon, ShieldPersonIcon } from "@/components/ui/icons";
import { routes } from "@/config/routes";
import { AuthCheckbox } from "@/features/auth/components/auth-checkbox";
import { AuthField, AuthPasswordField } from "@/features/auth/components/auth-field";
import { useSignIn } from "@/features/auth/hooks/use-sign-in";
import { signInSchema, type SignInFormValues } from "@/features/auth/schemas/sign-in.schema";

type SignInFormProps = {
  onSignedIn: () => void;
  /** System label beside the email field. */
  systemLabel: string;
  /** Decorative transport label beside "Remember me". */
  transportLabel: string;
};

export function SignInForm({ onSignedIn, systemLabel, transportLabel }: SignInFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignInFormValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "", remember: true },
  });
  const signIn = useSignIn({ onSuccess: onSignedIn });

  return (
    <form noValidate onSubmit={handleSubmit((values) => signIn.mutate(values))}>
      <AuthField
        variant="gateway"
        label="Email"
        labelAside={
          <span className="hidden font-display text-[13px] tracking-[0.02em] text-auth-muted sm:inline">
            {systemLabel}
          </span>
        }
        leadingIcon={<ShieldPersonIcon />}
        placeholder="you@example.com"
        type="email"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="none"
        spellCheck={false}
        error={errors.email?.message}
        {...register("email")}
      />

      <AuthPasswordField
        className="mt-[15px]"
        variant="gateway"
        label="Password"
        labelAside={
          <AppLink
            href={routes.forgotPassword}
            destinationLabel="Password recovery"
            className="font-display text-[13px] font-medium uppercase tracking-[0.06em] text-auth-primary hover:underline"
          >
            Forgot password?
          </AppLink>
        }
        leadingIcon={<KeyIcon />}
        placeholder="••••••••••••••••"
        autoComplete="current-password"
        toggleClassName="text-[#c5d4c9]"
        error={errors.password?.message}
        {...register("password")}
      />

      <div className="mt-[21px] flex items-center justify-between gap-3">
        <AuthCheckbox appearance="signal" className="items-center" {...register("remember")}>
          <span className="font-body text-[13.5px] text-auth-label">Remember me</span>
        </AuthCheckbox>
        <span className="font-display text-[13.5px] text-auth-muted">{transportLabel}</span>
      </div>

      {signIn.isError ? (
        <p
          role="alert"
          className="mt-4 rounded-[4px] border border-auth-danger/40 bg-auth-danger/10 px-3 py-2 font-body text-[13px] text-auth-danger"
        >
          {signIn.error.message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={signIn.isPending}
        className="mt-[20px] flex h-[65px] w-full items-center justify-center gap-[14px] rounded-[4px] bg-auth-primary font-display text-[15px] font-bold uppercase tracking-[0.06em] text-auth-on-primary sm:text-[20px] sm:tracking-[0.1em] transition-[filter,opacity] hover:brightness-110 disabled:cursor-wait disabled:opacity-75"
      >
        {signIn.isPending ? "Authenticating…" : "Engage Launcher // Sign In"}
        <ArrowForwardIcon aria-hidden className="text-[24px]" />
      </button>
    </form>
  );
}
