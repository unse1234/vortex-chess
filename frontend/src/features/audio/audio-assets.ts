/** Public URLs live here only. The supplied pack contains effects, no speech. */
export const audioAssets = {
  gameStart: { url: "/audio/game/game-start.mp3", channel: "game" },
  moveSelf: { url: "/audio/game/move-self.mp3", channel: "game" },
  moveOpponent: { url: "/audio/game/move-opponent.mp3", channel: "game" },
  capture: { url: "/audio/game/capture.mp3", channel: "game" },
  check: { url: "/audio/game/check.mp3", channel: "game" },
  castle: { url: "/audio/game/castle.mp3", channel: "game" },
  promotion: { url: "/audio/game/promotion.mp3", channel: "game" },
  // There are no distinct victory, defeat or draw recordings in this pack.
  gameEnd: { url: "/audio/game/game-end.mp3", channel: "game" },
  notification: { url: "/audio/notifications/notification.mp3", channel: "notification" },
} as const satisfies Record<string, { url: string; channel: "game" | "notification" }>;

export type AudioCue = keyof typeof audioAssets;
export type AudioChannel = (typeof audioAssets)[AudioCue]["channel"];
