import { Chess, type Square } from 'chess.js';

/**
 * Chess rules for authoritative play. chess.js generates and validates moves;
 * the adjudication policy (which draws are automatic, what a repeated position
 * is) is ours and documented in docs/Gameplay_Milestone.md. chess.js's
 * isDraw()/isThreefoldRepetition() are deliberately not used: its repetition
 * hash keeps an en passant square that a pin makes uncapturable, and its draw
 * flag mixes rules this game treats differently.
 */

export type Color = 'w' | 'b';
export type PromotionPiece = 'q' | 'r' | 'b' | 'n';
export type PieceLetter = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

export const STANDARD_START_FEN =
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export type Termination =
  | 'checkmate'
  | 'resignation'
  | 'timeout'
  | 'timeout-vs-insufficient-material'
  | 'stalemate'
  | 'insufficient-material'
  | 'threefold-repetition'
  | 'fifty-move-rule'
  | 'agreement';

/** winner null means a draw. */
export type Outcome = { winner: Color | null; termination: Termination };

/** Legal destinations per origin square, e.g. { e2: ['e3', 'e4'] }. */
export type LegalMoves = Record<string, string[]>;

export type PositionFacts = {
  turn: Color;
  legalMoves: LegalMoves;
  /** Square of the side to move's king when it is in check. */
  checkSquare: string | null;
};

export type MoveRequest = { from: string; to: string; promotion?: PromotionPiece };

export type EvaluatedMove = {
  uci: string;
  san: string;
  from: string;
  to: string;
  promotion: PromotionPiece | null;
  captured: PieceLetter | null;
  fenAfter: string;
  /** Facts about the resulting position, for the next player. */
  after: PositionFacts;
  /** Set when the move ends the game. Repetition is decided by the caller. */
  outcome: Outcome | null;
  repetitionKey: string;
};

export type MoveRejection = 'illegal_move' | 'promotion_required' | 'promotion_not_allowed';

export const opposite = (color: Color): Color => (color === 'w' ? 'b' : 'w');

/**
 * Identity of a position for repetition (FIDE 9.2.3): placement, side to
 * move, castling rights and an en passant square only when the capture is
 * actually legal. chess.js's FEN prints the en passant square only in that
 * case, so its first four fields are exactly this identity.
 */
export function repetitionKey(fen: string) {
  return fen.split(' ').slice(0, 4).join(' ');
}

function halfmoveClock(fen: string) {
  return Number(fen.split(' ')[4] ?? 0);
}

type BoardPiece = { type: PieceLetter; color: Color; square: string };

function pieces(chess: Chess): BoardPiece[] {
  return chess
    .board()
    .flat()
    .filter((p): p is NonNullable<typeof p> => p !== null)
    .map((p) => ({ type: p.type, color: p.color, square: p.square }));
}

const squareShade = (square: string) =>
  (square.charCodeAt(0) - 97 + Number(square[1])) % 2;

/**
 * Dead positions detected automatically: K v K, K + one minor piece v K, and
 * positions where every remaining piece besides the kings is a bishop on the
 * same square colour. Other dead positions (e.g. fully blocked pawn chains)
 * are not detected; players can agree a draw.
 */
export function isInsufficientMaterial(board: readonly BoardPiece[]) {
  const others = board.filter((p) => p.type !== 'k');
  if (others.length === 0) return true;
  if (others.length === 1 && (others[0].type === 'n' || others[0].type === 'b'))
    return true;
  if (others.every((p) => p.type === 'b')) {
    const shades = new Set(others.map((p) => squareShade(p.square)));
    return shades.size === 1;
  }
  return false;
}

/**
 * Whether `color` cannot checkmate by any sequence of legal moves (FIDE 6.9),
 * so running out of time against it is a draw. Beyond whole-board dead
 * positions, the only material that can never mate is a lone king: every other
 * piece can mate with the opponent's cooperation.
 */
export function cannotCheckmate(fen: string, color: Color) {
  const board = pieces(new Chess(fen));
  if (isInsufficientMaterial(board)) return true;
  return board.every((p) => p.color !== color || p.type === 'k');
}

/** Destination square of a SAN move played by `turn`, e.g. "Nxe5+" -> e5, "O-O" -> g1. */
function sanDestination(san: string, turn: Color) {
  const rank = turn === 'w' ? '1' : '8';
  if (san.startsWith('O-O-O')) return `c${rank}`;
  if (san.startsWith('O-O')) return `g${rank}`;
  return /([a-h][1-8])(=[QRBN])?[+#]?$/.exec(san)![1];
}

/**
 * Legal destinations per origin square. Built from chess.js's SAN lists per
 * square: verbose move objects compute two FEN strings per candidate and cost
 * about ten times more, which matters on the move's critical path.
 */
function legalMovesOf(chess: Chess, board: readonly BoardPiece[]): LegalMoves {
  const turn = chess.turn();
  const legalMoves: LegalMoves = {};
  for (const piece of board) {
    if (piece.color !== turn) continue;
    for (const san of chess.moves({ square: piece.square as Square })) {
      const targets = (legalMoves[piece.square] ??= []);
      const to = sanDestination(san, turn);
      if (!targets.includes(to)) targets.push(to);
    }
  }
  return legalMoves;
}

function factsOf(chess: Chess, board: readonly BoardPiece[] = pieces(chess)): PositionFacts {
  const legalMoves = legalMovesOf(chess, board);
  const turn = chess.turn();
  const checkSquare = chess.inCheck()
    ? (board.find((p) => p.type === 'k' && p.color === turn)?.square ?? null)
    : null;
  return { turn, legalMoves, checkSquare };
}

export function positionFacts(fen: string): PositionFacts {
  return factsOf(new Chess(fen));
}

/**
 * Validates a move against the position and describes the result. Rules that
 * need the game's history (repetition) are left to the caller; everything
 * else that ends the game on this move is reported, checkmate first.
 */
export function evaluateMove(
  fen: string,
  request: MoveRequest,
): { ok: true; move: EvaluatedMove } | { ok: false; reason: MoveRejection } {
  const chess = new Chess(fen);
  const mover = chess.turn();
  // Only the origin square's moves are generated.
  const fromPiece = chess.get(request.from as Square);
  if (!fromPiece || fromPiece.color !== mover)
    return { ok: false, reason: 'illegal_move' };
  const candidates = chess
    .moves({ square: request.from as Square })
    .filter((san) => sanDestination(san, mover) === request.to);
  if (candidates.length === 0) return { ok: false, reason: 'illegal_move' };
  const isPromotion = candidates.some((san) => san.includes('='));
  if (isPromotion && !request.promotion)
    return { ok: false, reason: 'promotion_required' };
  if (!isPromotion && request.promotion)
    return { ok: false, reason: 'promotion_not_allowed' };
  const played = chess.move({
    from: request.from as Square,
    to: request.to as Square,
    ...(request.promotion ? { promotion: request.promotion } : {}),
  });
  const fenAfter = played.after;
  const board = pieces(chess);
  const after = factsOf(chess, board);
  const noMoves = Object.keys(after.legalMoves).length === 0;
  let outcome: Outcome | null = null;
  if (noMoves && after.checkSquare) outcome = { winner: mover, termination: 'checkmate' };
  else if (noMoves) outcome = { winner: null, termination: 'stalemate' };
  else if (isInsufficientMaterial(board))
    outcome = { winner: null, termination: 'insufficient-material' };
  return {
    ok: true,
    move: {
      uci: `${played.from}${played.to}${played.promotion ?? ''}`,
      san: played.san,
      from: played.from,
      to: played.to,
      promotion: (played.promotion as PromotionPiece | undefined) ?? null,
      captured: (played.captured as PieceLetter | undefined) ?? null,
      fenAfter,
      after,
      outcome,
      repetitionKey: repetitionKey(fenAfter),
    },
  };
}

/**
 * Automatic draws that depend on the game's history, applied after a move
 * that did not already end the game: the third occurrence of a position, and
 * fifty moves by each side without a capture or pawn move.
 */
export function historyOutcome(
  fenAfter: string,
  occurrences: number,
): Outcome | null {
  if (occurrences >= 3)
    return { winner: null, termination: 'threefold-repetition' };
  if (halfmoveClock(fenAfter) >= 100)
    return { winner: null, termination: 'fifty-move-rule' };
  return null;
}

export function turnOf(fen: string): Color {
  return fen.split(' ')[1] === 'b' ? 'b' : 'w';
}
