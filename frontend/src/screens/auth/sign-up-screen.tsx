import Link from "next/link";
import { ArtworkBand } from "@/components/layout/artwork-band";
import { ArrowForwardIcon, ShieldHouseIcon } from "@/components/ui/icons";
import { routes } from "@/config/routes";
import { AuthCard } from "@/features/auth/components/auth-card";
import { AuthDivider } from "@/features/auth/components/auth-divider";
import { AuthEmblem } from "@/features/auth/components/auth-emblem";
import {
  AuthProviderButtons,
  signUpProviders,
} from "@/features/auth/components/auth-provider-buttons";
import { authTelemetry } from "@/screens/auth/auth-telemetry";
import { LatencyReading } from "@/screens/auth/live-telemetry";
import { SignUpPanel } from "@/screens/auth/sign-up-panel";
import { TelemetryCorner } from "@/screens/auth/telemetry-corner";

export function SignUpScreen() {
  const copy = authTelemetry.signUp;

  return (
    <ArtworkBand src="/artwork/sign-up-background.webp" className="px-3 py-[30px] sm:mx-5">
      <TelemetryCorner
        align="left"
        tone="primary"
        marker="square"
        title={copy.leftTitle}
        lines={[
          <>
            <LatencyReading /> {"// "}
            {copy.leftDetails[0]}
          </>,
          copy.leftDetails[1],
        ]}
        className="left-[30px] top-[57px] leading-[23px] opacity-45"
        lineTracking="tracking-[0.03em]"
      />
      <TelemetryCorner
        align="right"
        tone="amber"
        title={copy.rightTitle}
        lines={copy.rightDetails}
        className="right-[30px] top-[57px] leading-[23px] opacity-45"
        lineTracking="tracking-[0.03em]"
      />

      <div className="mx-auto w-full max-w-[700px]">
        <AuthCard className="bg-[rgb(22_30_38/0.96)] px-5 pb-[31px] pt-[30px] sm:px-[30px]">
          <AuthEmblem icon={<ShieldHouseIcon className="text-[34px]" />} className="size-[70px] rounded-[10px] bg-auth-field-alt" />
          <p className="mx-auto mt-[11px] flex h-[21px] w-fit items-center gap-[6px] rounded-full bg-[#252b33] px-[10px] font-display text-[13px] font-medium tracking-[0.115em] text-auth-primary">
            <span aria-hidden className="size-[6px] rounded-full bg-auth-primary" />
            NEW OPERATOR ENLISTMENT
          </p>
          <h1 className="mt-[7px] text-center font-display text-[26px] font-semibold leading-[36px] text-auth-title sm:text-[31px]">
            CREATE OPERATOR PROFILE
          </h1>
          <p className="mt-[7px] text-center font-body text-[15px] leading-[20px] text-[#c7d7cb]">
            Create your Vortix Chess account with email and password.
            <br className="hidden sm:block" /> Keep your username for private game invitations.
          </p>

          <div className="mt-[23px]">
            <SignUpPanel />
          </div>

          <AuthDivider className="mt-[21px]">
            <span className="bg-[#171c26] px-[14px] text-[13px] leading-[18px] tracking-[0.133em]">Alternate Neural Sign-In</span>
          </AuthDivider>
          <AuthProviderButtons providers={signUpProviders} layout="inline" className="mt-[21px]" />

          <p className="mt-[24px] flex flex-wrap items-baseline justify-center gap-x-[12px] text-center font-body text-[15px] leading-[22px] text-[#c6d6ca]">
            Already an authenticated operator?
            <Link
              href={routes.signIn}
              className="inline-flex items-center gap-[2px] font-mono text-[14px] font-bold tracking-[0.025em] text-auth-primary hover:underline"
            >
              RETURN TO OPERATOR LOGIN
              <ArrowForwardIcon aria-hidden className="text-[15px]" />
            </Link>
          </p>

          <div className="mt-[24px] flex flex-wrap justify-between gap-x-4 gap-y-1 font-display text-[13px] leading-4 tracking-[0.075em] text-auth-dim">
            <span>{copy.engine}</span>
            <span>{copy.build}</span>
          </div>
        </AuthCard>
      </div>
    </ArtworkBand>
  );
}
