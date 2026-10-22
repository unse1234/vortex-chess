import type { ReactNode } from "react";
import Image from "next/image";
import { cn } from "@/utils/cn";

type ArtworkBandProps = {
  /** Pre-composited artwork; it already includes its darkening and edge fades. */
  src: string;
  children: ReactNode;
  className?: string;
};

/** Full-width section with decorative artwork behind centred content. */
export function ArtworkBand({ src, children, className }: ArtworkBandProps) {
  return (
    <section className={cn("relative isolate overflow-hidden", className)}>
      <Image
        src={src}
        alt=""
        fill
        preload
        sizes="100vw"
        className="-z-10 object-cover object-center"
      />
      {children}
    </section>
  );
}
