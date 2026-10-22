import Link from "next/link";
import { routes } from "@/config/routes";

type RoutePlaceholderProps = {
  title: string;
  description: string;
};

/** Stand-in for a screen that is routable but not designed yet. */
export function RoutePlaceholder({ title, description }: RoutePlaceholderProps) {
  return (
    <main id="main-content" className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-lg border border-line bg-surface/95 p-8 text-center shadow-panel">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-accent">Preview route</p>
        <h1 className="mt-2 text-2xl font-bold text-fg">{title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-fg-muted">{description}</p>
        <Link href={routes.play} className="mt-6 inline-block text-sm font-semibold text-accent hover:underline">
          Back to the lobby
        </Link>
      </div>
    </main>
  );
}
