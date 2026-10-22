/** "Think / Move / Win" brush lettering with its outlined crown. */
export function HeroTagline() {
  return (
    <p className="relative flex select-none flex-col items-center font-brush leading-[0.98] tracking-[0.02em] drop-shadow-[0_6px_18px_rgb(0_0_0/0.6)]">
      <svg
        aria-hidden
        viewBox="0 0 40 26"
        className="mb-1 w-[0.55em] text-[#e5eaee] [stroke-linejoin:round]"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
      >
        <path d="M4 22 L2.5 6 L12 13 L20 2.5 L28 13 L37.5 6 L36 22 Z" />
      </svg>
      <span className="text-[#e5eaee]">THINK</span>
      <span className="text-[#e5eaee]">MOVE</span>
      <span className="text-[1.12em] text-[#f0da84]">WIN</span>
    </p>
  );
}
