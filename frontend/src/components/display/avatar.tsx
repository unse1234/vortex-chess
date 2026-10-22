import Image from "next/image";
import { cn } from "@/utils/cn";

export type PresenceTone = "online" | "away" | "offline";

const presenceClasses: Record<PresenceTone, string> = {
  online: "bg-success-strong",
  away: "bg-accent",
  offline: "bg-fg-subtle",
};

type AvatarProps = {
  src: string | null;
  name: string;
  /** Rendered size in pixels. */
  size?: number;
  presence?: PresenceTone;
  /** Desaturates the picture, e.g. for offline players. */
  muted?: boolean;
  className?: string;
};

function initials(name: string) {
  const parts = name.match(/[A-Z]?[a-z]+|[A-Z]+(?![a-z])|\d+/g) ?? [name];
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

/** Square player picture with an initials fallback and optional presence dot. */
export function Avatar({ src, name, size = 40, presence, muted = false, className }: AvatarProps) {
  return (
    <span
      className={cn("relative inline-flex shrink-0", className)}
      style={{ width: size, height: size }}
    >
      {src ? (
        <Image
          src={src}
          alt=""
          width={size}
          height={size}
          className={cn(
            "size-full rounded-[4px] object-cover ring-1 ring-white/10",
            muted && "opacity-80 grayscale",
          )}
        />
      ) : (
        <span
          aria-hidden
          className="flex size-full items-center justify-center rounded-[4px] bg-surface-hover text-[0.8em] font-bold text-fg-muted ring-1 ring-white/10"
          style={{ fontSize: size * 0.38 }}
        >
          {initials(name)}
        </span>
      )}
      {presence ? (
        <span
          aria-hidden
          className={cn(
            "absolute -bottom-1 -right-1 size-3.5 rounded-full ring-[2.5px] ring-sidebar",
            presenceClasses[presence],
          )}
        />
      ) : null}
    </span>
  );
}
