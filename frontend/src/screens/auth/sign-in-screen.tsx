import Link from "next/link";
import { ArtworkBand } from "@/components/layout/artwork-band";
import { MedalIcon } from "@/components/ui/icons";
import { appConfig } from "@/config/app";
import { routes } from "@/config/routes";
import { AuthCard } from "@/features/auth/components/auth-card";
import { AuthDivider } from "@/features/auth/components/auth-divider";
import { AuthEmblem } from "@/features/auth/components/auth-emblem";
import {
  AuthProviderButtons,
  signInProviders,
} from "@/features/auth/components/auth-provider-buttons";
import { authTelemetry } from "@/screens/auth/auth-telemetry";
import { LatencyReading, ReachabilityTag } from "@/screens/auth/live-telemetry";
import { SignInPanel } from "@/screens/auth/sign-in-panel";
import { TelemetryCorner } from "@/screens/auth/telemetry-corner";

export function SignInScreen() {
  const copy = authTelemetry.signIn;
  const [brandFirst, ...brandRest] = appConfig.name.toUpperCase().split(" ");

  return (
    <ArtworkBand src="/artwork/sign-in-background.webp" className="px-3 py-[30px] sm:mx-5">
      <TelemetryCorner
        align="left"
        tone="primary"
        marker="dot"
        title={copy.leftTitle}
        lines={[
          <>
            <LatencyReading /> {"// "}
            {copy.leftDetail}
          </>,
        ]}
        className="left-[40px] top-[30px] leading-[18px]"
      />
      <TelemetryCorner
        align="right"
        tone="amber"
        title={copy.rightTitle}
        lines={[copy.rightDetail]}
        className="right-[40px] top-[30px] leading-[18px]"
      />

      <div className="mx-auto w-full max-w-[560px]">
        <AuthCard className="bg-[rgb(20_27_36/0.9)] px-5 pb-[28px] pt-[31px] sm:px-[30px]">
          <AuthEmblem pip icon={<MedalIcon className="text-[37px]" />} className="size-[70px] bg-[#252a35]" />
          <h1 className="mt-[14px] text-center font-display text-[28px] font-bold leading-[40px] tracking-[0.01em] text-auth-title sm:text-[32px]">
            {brandFirst} <span className="text-auth-primary">{"//"}</span> {brandRest.join(" ")}
          </h1>
          <p className="mt-[4px] text-center font-mono text-[12px] font-medium leading-5 tracking-[0.24em] text-auth-label sm:text-[14px]">
            CYBER-TACTICAL MATCH PROTOCOL
          </p>
          <p className="mx-auto mt-[14px] flex h-[23px] w-fit items-center gap-[8px] rounded-full bg-auth-chip px-[14px] font-display text-[11.5px] font-medium tracking-[0.09em] text-auth-text sm:text-[13px]">
            <span aria-hidden className="size-[6px] rounded-full bg-auth-primary" />
            OPERATOR AUTHENTICATION GATEWAY
          </p>

          <div className="mt-[19px]">
            <SignInPanel />
          </div>

          <AuthDivider className="mt-[22px]">
            <span className="px-[10px] text-[14px] leading-[17px] tracking-[0.09em]">Authenticate via Secure Protocol</span>
          </AuthDivider>
          <AuthProviderButtons providers={signInProviders} layout="tiles" className="mt-[19px]" />

          <p className="mt-[25px] flex flex-wrap items-baseline justify-center gap-x-[8px] text-center font-body text-[15px] leading-[22px] text-auth-label">
            New Operator in theater?
            <Link
              href={routes.signUp}
              className="font-mono text-[16px] font-bold tracking-[0.03em] text-auth-primary hover:underline"
            >
              INITIATE DOSSIER {"//"} REGISTER
            </Link>
          </p>
        </AuthCard>

        <p className="mt-[17px] flex items-center gap-[18px] rounded-[12px] bg-[#0a1019]/90 py-[6px] pl-[15px] pr-[25px]">
          <span aria-hidden className="size-[7px] shrink-0 rounded-full bg-auth-primary" />
          <span className="flex-1 text-center font-display text-[13px] font-medium leading-[17px] tracking-[0.085em] text-auth-muted">
            {copy.client} • {copy.server} <ReachabilityTag /> • {copy.antiCheat}
          </span>
        </p>
      </div>
    </ArtworkBand>
  );
}
