import { httpClient } from "@/lib/http/browser-client";
import type {
  AnalysisPath,
  PreviewResponse,
} from "@/features/games/types/analysis.types";

/** Separate HTTP preview transport; never sends a live-game command. */
export async function previewAnalysis(
  gameId: string,
  input: AnalysisPath,
  signal: AbortSignal,
): Promise<PreviewResponse> {
  const { data } = await httpClient.post<PreviewResponse>(
    `/games/${encodeURIComponent(gameId)}/analysis/preview`,
    input,
    { signal },
  );
  return data;
}
