"use client";

import { useId } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { ComingSoon } from "@/components/display/coming-soon";
import { features } from "@/config/capabilities";
import { AppLink } from "@/components/ui/app-link";
import {
  AtSignIcon,
  BadgeIcon,
  CheckCircleIcon,
  KeyIcon,
  LockResetIcon,
  MedalOutlineIcon,
  SwordsOutlineIcon,
  VerifiedUserIcon,
} from "@/components/ui/icons";
import { routes } from "@/config/routes";
import { AuthCheckbox } from "@/features/auth/components/auth-checkbox";
import {
  AuthField,
  AuthPasswordField,
} from "@/features/auth/components/auth-field";
import { PasswordStrengthMeter } from "@/features/auth/components/password-strength-meter";
import { PlaystylePicker } from "@/features/auth/components/playstyle-picker";
import {
  useUsernameAvailability,
  type UsernameAvailabilityState,
} from "@/features/auth/hooks/use-username-availability";
import { useSignUp } from "@/features/auth/hooks/use-sign-up";
import {
  signUpSchema,
  type SignUpFormValues,
} from "@/features/auth/schemas/sign-up.schema";
import { ApiError } from "@/lib/http/api-error";
import { cn } from "@/utils/cn";

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const signUpFields = [
  "username",
  "email",
  "password",
  "confirmPassword",
] as const;

export function SignUpForm({ onSignedUp }: { onSignedUp: () => void }) {
  const playstyleLabelId = useId();
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<SignUpFormValues>({
    resolver: zodResolver(signUpSchema),
    mode: "onTouched",
    defaultValues: {
      username: "",
      email: "",
      password: "",
      confirmPassword: "",
      acceptTerms: false,
    },
  });
  const [username, email, password, confirmPassword] = useWatch({
    control,
    name: ["username", "email", "password", "confirmPassword"],
  });
  const availability = useUsernameAvailability(username);
  const signUp = useSignUp({ onSuccess: onSignedUp });

  const onSubmit = handleSubmit((values) => {
    if (availability.status === "taken") {
      setError("username", { message: "That username is already taken." });
      return;
    }
    signUp.mutate(
      {
        username: values.username,
        email: values.email,
        password: values.password,
        confirmPassword: values.confirmPassword,
        acceptTerms: true,
      },
      {
        onError: (error) => {
          if (!(error instanceof ApiError)) return;
          for (const field of signUpFields) {
            const message = error.fieldErrors[field]?.[0];
            if (message) setError(field, { message });
          }
        },
      },
    );
  });

  const passwordsMatch =
    confirmPassword.length > 0 && confirmPassword === password;
  const hasFieldErrors =
    signUp.error instanceof ApiError &&
    Object.keys(signUp.error.fieldErrors).length > 0;

  return (
    <form noValidate onSubmit={onSubmit}>
      <AuthField
        variant="enlistment"
        label="Username"
        labelIcon={<BadgeIcon />}
        labelAside={<AvailabilityStatus state={availability} />}
        placeholder="Grandmaster_V"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={20}
        trailing={
          availability.status === "available" && availability.tag ? (
            <span className="font-mono text-[15px] text-[#8f9d92]">
              {availability.tag}
            </span>
          ) : null
        }
        error={errors.username?.message}
        {...register("username")}
      />

      <AuthField
        className="mt-[19px]"
        variant="enlistment"
        type="email"
        label="Email"
        labelIcon={<AtSignIcon />}
        placeholder="operator@valkyrie-core.net"
        autoComplete="email"
        autoCapitalize="none"
        spellCheck={false}
        trailing={
          <VerifiedUserIcon
            aria-hidden
            className={cn(
              "text-[22px]",
              EMAIL_SHAPE.test(email) ? "text-auth-primary" : "text-[#8d9c91]",
            )}
          />
        }
        error={errors.email?.message}
        {...register("email")}
      />

      <div className="mt-[19px] grid gap-x-[16px] gap-y-[19px] sm:grid-cols-2">
        <AuthPasswordField
          variant="enlistment"
          label="Password"
          labelIcon={<KeyIcon />}
          autoComplete="new-password"
          toggleClassName="text-[#8d9c91]"
          aria-describedby="access-key-strength"
          error={errors.password?.message}
          {...register("password")}
        />
        <AuthPasswordField
          variant="enlistment"
          label="Confirm password"
          labelIcon={<LockResetIcon />}
          autoComplete="new-password"
          showToggle={false}
          status={
            passwordsMatch ? (
              <CheckCircleIcon
                title="Passwords match"
                className="text-[22px] text-auth-primary"
              />
            ) : null
          }
          error={errors.confirmPassword?.message}
          {...register("confirmPassword")}
        />
      </div>

      <div className="mt-[16px]">
        <PasswordStrengthMeter id="access-key-strength" password={password} />
      </div>

      <p
        id={playstyleLabelId}
        className="mt-[15px] flex min-h-5 items-center gap-[6px] font-display text-[13px] font-medium uppercase tracking-[0.09em] text-auth-text"
      >
        <MedalOutlineIcon aria-hidden className="text-[17px] text-[#ffc162]" />
        Tactical Doctrine / Playstyle
      </p>
      <div className="mt-[8px]">
        <PlaystylePicker labelledBy={playstyleLabelId} />
      </div>

      <div className="mt-[16px] flex flex-col gap-[7px] font-body text-[15px] leading-[19px] text-[#c7d7cb]">
        <AuthCheckbox appearance="check" {...register("acceptTerms")}>
          <span>
            I accept{" "}
            <AppLink
              href={routes.terms}
              destinationLabel="Terms of Use"
              className="text-auth-primary hover:underline"
            >
              Terms of Use
            </AppLink>
            .
          </span>
        </AuthCheckbox>
        {errors.acceptTerms ? (
          <p className="pl-[22px] text-[12.5px] text-auth-danger">
            {errors.acceptTerms.message}
          </p>
        ) : null}
        <AuthCheckbox
          appearance="check"
          disabled={!features.marketing.available}
        >
          <span>
            Tournament updates <ComingSoon feature="marketing" />
          </span>
        </AuthCheckbox>
      </div>

      {signUp.isError && !hasFieldErrors ? (
        <p
          role="alert"
          className="mt-4 rounded-[4px] border border-auth-danger/40 bg-auth-danger/10 px-3 py-2 font-body text-[13px] text-auth-danger"
        >
          {signUp.error.message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={signUp.isPending}
        className="mt-[20px] flex h-[64px] w-full items-center justify-center gap-[14px] rounded-[6px] bg-auth-primary font-display text-[13px] font-bold uppercase tracking-[0.03em] text-auth-on-primary shadow-[0_10px_34px_-8px_rgb(78_222_163/0.45)] sm:text-[20px] sm:tracking-[0.04em] transition-[filter,opacity] hover:brightness-110 disabled:cursor-wait disabled:opacity-75"
      >
        {signUp.isPending
          ? "Initializing…"
          : "Initialize Account & Enter Arena"}
        <SwordsOutlineIcon
          aria-hidden
          className="shrink-0 text-[24px] sm:text-[32px]"
        />
      </button>
    </form>
  );
}

function AvailabilityStatus({ state }: { state: UsernameAvailabilityState }) {
  const content = {
    idle: null,
    unknown: null,
    checking: <span className="text-auth-muted">Checking…</span>,
    available: (
      <span className="flex items-center gap-[6px] text-auth-primary">
        <span aria-hidden className="size-[6px] rounded-full bg-current" />
        Available
      </span>
    ),
    taken: (
      <span className="flex items-center gap-[6px] text-auth-danger">
        <span aria-hidden className="size-[6px] rounded-full bg-current" />
        Taken
      </span>
    ),
  }[state.status];

  return (
    <span
      aria-live="polite"
      className="font-mono text-[13px] font-bold uppercase tracking-[0.1em]"
    >
      {content}
    </span>
  );
}
