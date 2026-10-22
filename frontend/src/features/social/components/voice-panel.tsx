import { FeatureUnavailable } from "@/components/display/feature-unavailable";

export function VoicePanel() {
  return <FeatureUnavailable feature="voice" title="Voice Matrix HUD" className="min-h-[180px]" />;
}
