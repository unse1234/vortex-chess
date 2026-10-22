import Image from "next/image";

/**
 * Hero artwork behind the launcher content. The overlays darken the image so
 * the king stays the focal point while cards and panels remain readable.
 * Below `xl` the page scrolls, so the artwork is anchored to the hero area
 * instead of stretching (and blurring) across the whole page.
 */
export function LauncherBackdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 h-[560px] overflow-hidden md:h-[760px] xl:inset-0 xl:h-auto"
    >
      <Image
        src="/artwork/launcher-background.png"
        alt=""
        fill
        preload
        sizes="(min-width: 1280px) calc(100vw - 360px), 100vw"
        className="object-cover object-[55%_top]"
      />
      <div className="absolute inset-0 bg-[#0a1018]/[0.82]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_55%_at_58%_32%,transparent_0%,rgb(8_12_20/0.55)_70%,rgb(8_12_20/0.85)_100%)]" />
      <div className="absolute inset-x-0 bottom-0 h-3/5 bg-linear-to-b from-transparent via-[#090d16]/80 to-canvas xl:to-[#090d16]" />
    </div>
  );
}
