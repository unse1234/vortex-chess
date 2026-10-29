import type { QueryClient } from "@tanstack/react-query";
import { socialKeys } from "@/features/social/queries/social.queries";
import type { RealtimeEvent } from "@/lib/realtime/realtime-contract";

/** Cancel first: a pre-mutation HTTP response must never repopulate old data.
 * Events are invalidations, never snapshots. Reordered events remain harmless. */
export async function refreshSocial(queryClient: QueryClient) {
  await queryClient.cancelQueries({ queryKey: socialKeys.relationships });
  await queryClient.invalidateQueries({ queryKey: socialKeys.relationships });
}
export function socialRevisionOf(payload: unknown): number | null {
  if (!payload || typeof payload !== "object" || !("revision" in payload))
    return null;
  return typeof payload.revision === "number" &&
    Number.isSafeInteger(payload.revision) &&
    payload.revision >= 0
    ? payload.revision
    : null;
}

/** Personal events carry invalidations only. A reordered or duplicate revision
 * must never restore cached rows or repeat relationship notifications. */
export function socialEventHandler(
  refresh: () => void,
  onChanged?: () => void,
) {
  let highestRevision = -1;
  return (event: Pick<RealtimeEvent, "type" | "payload">) => {
    if (event.type === "social.updated") {
      const revision = socialRevisionOf(event.payload);
      if (revision === null || revision <= highestRevision) return;
      highestRevision = revision;
      refresh();
      onChanged?.();
    } else if (event.type === "social.presence") refresh();
  };
}
