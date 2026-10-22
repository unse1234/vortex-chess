import type { GameSnapshot } from "@/features/games/types/game.types";

/** Every game endpoint answers with the authoritative snapshot after the change. */
export type GameResponse = {
  game: GameSnapshot;
};
