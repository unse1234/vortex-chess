export const gameKeys = {
  all: ["games"] as const,
  detail: (gameId: string) => [...gameKeys.all, "detail", gameId] as const,
};
