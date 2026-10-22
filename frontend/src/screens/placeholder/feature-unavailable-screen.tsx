import Link from "next/link";
import { FeatureUnavailable } from "@/components/display/feature-unavailable";
import type { FeatureId } from "@/config/capabilities";
import { routes } from "@/config/routes";

export function FeatureUnavailableScreen({ feature }: { feature: FeatureId }) {
  return (
    <main id="main-content" className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-lg border border-line bg-surface/95 p-8 text-center shadow-panel">
        <h1 className="text-2xl font-bold text-fg">Coming Soon</h1>
        <FeatureUnavailable feature={feature} className="mt-4" />
        <Link href={routes.play} className="mt-6 inline-block text-sm font-semibold text-accent hover:underline">Back to the lobby</Link>
      </div>
    </main>
  );
}
