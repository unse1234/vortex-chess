/** Official start is game creation. Disconnect has no result; no-show creates no game. */
export function isRatingEligible(game: {
  rated: boolean;
  mode: string;
  status: string;
  result: string | null;
  termination: string | null;
}) {
  return (
    game.rated &&
    game.mode === 'RANDOM' &&
    game.status === 'FINISHED' &&
    ['WHITE_WINS', 'BLACK_WINS', 'DRAW'].includes(game.result ?? '') &&
    game.termination !== null &&
    game.termination !== 'ENGINE_FAILURE'
  );
}
