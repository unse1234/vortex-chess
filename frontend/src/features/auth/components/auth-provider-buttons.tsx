import type { ComponentType } from "react";
import { ComingSoon } from "@/components/display/coming-soon";
import {
  CubeIcon,
  ForumIcon,
  GamepadOutlineIcon,
  HeadsetIcon,
  type IconProps,
} from "@/components/ui/icons";
import { features } from "@/config/capabilities";
import type { AuthProviderId } from "@/features/auth/types/auth.types";
import { cn } from "@/utils/cn";


export type AuthProviderOption = {
  id: AuthProviderId;
  label: string;
  Icon: ComponentType<IconProps>;
  iconClassName?: string;
};

export const signInProviders: readonly AuthProviderOption[] = [
  { id: "steam", label: "Steam", Icon: GamepadOutlineIcon },
  { id: "discord", label: "Discord", Icon: HeadsetIcon },
  { id: "google", label: "Google", Icon: CubeIcon },
];

export const signUpProviders: readonly AuthProviderOption[] = [
  { id: "steam", label: "Steam Enlist", Icon: GamepadOutlineIcon, iconClassName: "text-[#f7b45d]" },
  { id: "discord", label: "Discord Link", Icon: ForumIcon, iconClassName: "text-auth-lavender" },
];

type AuthProviderButtonsProps = {
  providers: readonly AuthProviderOption[];
  /** `tiles`: icon above label. `inline`: icon beside label. */
  layout: "tiles" | "inline";
  className?: string;
};

/**
 * Third-party sign-in entry points. Providers stay visible as in the design,
 * but explain they're unavailable until the backend supports them.
 */
export function AuthProviderButtons({ providers, layout, className }: AuthProviderButtonsProps) {

  return (
    <div
      className={cn(
        "grid gap-[10px]",
        layout === "tiles" ? "grid-cols-3" : "gap-[16px] sm:grid-cols-2",
        className,
      )}
    >
      {providers.map(({ id, label, Icon, iconClassName }) => (
        <button
          key={id}
          type="button"
          disabled={!features.alternativeAuth.available}
          className={cn(
            "flex items-center justify-center rounded-[4px] font-mono font-bold uppercase transition-colors",
            layout === "tiles"
              ? "min-h-[90px] flex-col gap-[6px] bg-auth-tile text-[13px] tracking-[0.15em] text-auth-label hover:bg-[#262c38]"
              : "min-h-[65px] flex-wrap gap-[8px] bg-auth-field-alt text-[14px] tracking-[0.075em] text-auth-text hover:bg-[#222834]",
          )}
        >
          <Icon aria-hidden className={cn(layout === "tiles" ? "text-[24px]" : "text-[22px]", iconClassName)} />
          {label}
          <ComingSoon feature="alternativeAuth" />
        </button>
      ))}
    </div>
  );
}
