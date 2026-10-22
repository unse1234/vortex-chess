import { estimatePasswordStrength, type PasswordStrength } from "@/features/auth/password-strength";
import { cn } from "@/utils/cn";

const SEGMENTS = 3;

const toneClasses: Record<PasswordStrength["tone"], { text: string; fill: string; last: string }> = {
  idle: { text: "text-auth-dim", fill: "bg-auth-dim", last: "bg-auth-dim" },
  danger: { text: "text-auth-danger", fill: "bg-auth-danger", last: "bg-auth-danger" },
  warning: { text: "text-auth-amber", fill: "bg-auth-amber", last: "bg-auth-amber" },
  success: { text: "text-auth-primary", fill: "bg-auth-primary", last: "bg-auth-primary-strong" },
};

/** Live guidance while choosing an access key; the server enforces the policy. */
export function PasswordStrengthMeter({ password, id }: { password: string; id?: string }) {
  const strength = estimatePasswordStrength(password);
  const tone = toneClasses[strength.tone];
  const valueText =
    strength.tone === "idle" ? strength.label : `${strength.label} (${strength.score}%)`;

  return (
    <div id={id} className="rounded-[4px] bg-auth-well px-[10px] pb-[6px] pt-[5px]">
      <div className="flex items-center justify-between gap-3">
        <span className="font-display text-[11px] uppercase tracking-[0.06em] text-auth-muted sm:text-[13px] sm:tracking-[0.09em]">
          Neural Encryption Strength
        </span>
        <span aria-live="polite" className={cn("shrink-0 font-mono text-[11px] font-bold tracking-[0.04em] sm:text-[13px] sm:tracking-[0.06em]", tone.text)}>
          {valueText}
        </span>
      </div>
      <div
        role="meter"
        aria-label="Access key strength"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={strength.score}
        aria-valuetext={valueText}
        className="mt-[7px] flex gap-[2px]"
      >
        {Array.from({ length: SEGMENTS }, (_, index) => {
          const fill = Math.min(1, Math.max(0, (strength.score / 100) * SEGMENTS - index));
          return (
            <span key={index} className="h-[6px] flex-1 overflow-hidden rounded-full bg-white/[0.06]">
              <span
                className={cn("block h-full rounded-full transition-[width] duration-300", index === SEGMENTS - 1 ? tone.last : tone.fill)}
                style={{ width: `${fill * 100}%` }}
              />
            </span>
          );
        })}
      </div>
    </div>
  );
}
