import { ComingSoon } from "@/components/display/coming-soon";
import { MicOffIcon } from "@/components/ui/icons";
import { features } from "@/config/capabilities";

export function VoiceToggleButton() {
  return (
    <button type="button" disabled={!features.voice.available} className="inline-flex min-h-[34px] items-center gap-2 rounded-[4px] bg-[#1b202a] px-3 py-1 font-mono text-[13px] text-auth-muted">
      <MicOffIcon aria-hidden className="text-[20px]" /> Voice <ComingSoon feature="voice" />
    </button>
  );
}
