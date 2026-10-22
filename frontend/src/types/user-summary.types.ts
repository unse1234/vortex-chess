/** Minimal public identity of a player, shared by auth, games and social contracts. */
export type UserSummary = {
  id: string;
  username: string;
  avatarUrl: string | null;
};
