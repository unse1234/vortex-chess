import { FeatureUnavailable } from "@/components/display/feature-unavailable";

export function MatchChatPanel() {
  return <FeatureUnavailable feature="chat" title="Arena Comms" className="min-h-[250px] flex-1" />;
}
