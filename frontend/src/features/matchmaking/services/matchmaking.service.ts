import { httpClient } from "@/lib/http/browser-client";
import type { MatchmakingOptions, MatchmakingStatus } from "@/features/matchmaking/types/matchmaking.types";

export async function getMatchmakingOptions(signal?: AbortSignal) {
  const { data } = await httpClient.get<MatchmakingOptions>("/matchmaking/options", { signal });
  return data;
}
export async function getMatchmakingStatus(signal?: AbortSignal) {
  const { data } = await httpClient.get<MatchmakingStatus>("/matchmaking", { signal });
  return data;
}
export async function joinMatchmaking(input: { timeControl: NonNullable<MatchmakingStatus["timeControl"]>; rated: boolean }) {
  const { data } = await httpClient.post<MatchmakingStatus>("/matchmaking/join", input);
  return data;
}
export async function cancelMatchmaking(searchId: string) {
  const { data } = await httpClient.post<MatchmakingStatus>("/matchmaking/cancel", { searchId });
  return data;
}
export async function confirmMatchmaking(searchId: string) {
  const { data } = await httpClient.post<MatchmakingStatus>("/matchmaking/ready", { searchId });
  return data;
}
