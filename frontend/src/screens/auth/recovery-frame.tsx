import type { ReactNode } from "react";
import { ArtworkBand } from "@/components/layout/artwork-band";
import { AuthCard } from "@/features/auth/components/auth-card";
import { AuthEmblem } from "@/features/auth/components/auth-emblem";

/** Shared layout for the password recovery screens, matching the sign-in console. */
export function RecoveryFrame({
  icon,
  eyebrow,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  eyebrow: string;
  title: string;
  description: ReactNode;
  children: ReactNode;
}) {
  return (
    <ArtworkBand src="/artwork/sign-in-background.webp" className="px-3 py-[30px] sm:mx-5">
      <div className="mx-auto w-full max-w-[520px]">
        <AuthCard className="bg-[rgb(20_27_36/0.92)] px-5 pb-[28px] pt-[31px] sm:px-[30px]">
          <AuthEmblem icon={icon} className="size-[64px] bg-[#252a35]" />
          <p className="mx-auto mt-[14px] flex h-[23px] w-fit items-center gap-[8px] rounded-full bg-auth-chip px-[14px] font-display text-[11.5px] font-medium tracking-[0.09em] text-auth-text sm:text-[13px]">
            <span aria-hidden className="size-[6px] rounded-full bg-auth-primary" />
            {eyebrow}
          </p>
          <h1 className="mt-[10px] text-center font-display text-[26px] font-bold leading-[36px] text-auth-title sm:text-[30px]">
            {title}
          </h1>
          <p className="mt-[6px] text-center font-body text-[15px] leading-[21px] text-auth-label">{description}</p>
          <div className="mt-[22px]">{children}</div>
        </AuthCard>
      </div>
    </ArtworkBand>
  );
}
