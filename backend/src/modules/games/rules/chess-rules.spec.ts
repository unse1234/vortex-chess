import { Chess } from 'chess.js';
import {
  cannotCheckmate,
  evaluateMove,
  historyOutcome,
  positionFacts,
  repetitionKey,
  STANDARD_START_FEN,
  type MoveRequest,
} from './chess-rules';
import { buildPgn } from './pgn';

function play(fen: string, ...moves: string[]) {
  let current = fen;
  for (const uci of moves) {
    const request: MoveRequest = {
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      ...(uci[4] ? { promotion: uci[4] as MoveRequest['promotion'] } : {}),
    };
    const result = evaluateMove(current, request);
    if (!result.ok) throw new Error(`${uci} rejected: ${result.reason}`);
    current = result.move.fenAfter;
  }
  return current;
}

const move = (fen: string, uci: string) => {
  const result = evaluateMove(fen, {
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    ...(uci[4] ? { promotion: uci[4] as MoveRequest['promotion'] } : {}),
  });
  if (!result.ok) throw new Error(result.reason);
  return result.move;
};

describe('Move validation', () => {
  it('accepts legal moves with SAN, UCI and the next legal destinations', () => {
    const e4 = move(STANDARD_START_FEN, 'e2e4');
    expect(e4).toMatchObject({ san: 'e4', uci: 'e2e4', captured: null, outcome: null });
    expect(e4.after.turn).toBe('b');
    expect(e4.after.legalMoves.e7).toEqual(['e6', 'e5']);
    expect(positionFacts(STANDARD_START_FEN).legalMoves.g1?.sort()).toEqual(['f3', 'h3']);
  });

  it('rejects illegal and wrong-side moves', () => {
    expect(evaluateMove(STANDARD_START_FEN, { from: 'e2', to: 'e5' })).toEqual({ ok: false, reason: 'illegal_move' });
    expect(evaluateMove(STANDARD_START_FEN, { from: 'e7', to: 'e5' })).toEqual({ ok: false, reason: 'illegal_move' });
    expect(evaluateMove(STANDARD_START_FEN, { from: 'e3', to: 'e4' })).toEqual({ ok: false, reason: 'illegal_move' });
  });

  it('castles on both sides and refuses castling through an attacked square', () => {
    const ready = 'r3k2r/pppqbppp/2np1n2/4p3/4P3/2NP1N2/PPPQBPPP/R3K2R w KQkq - 0 1';
    expect(move(ready, 'e1g1')).toMatchObject({ san: 'O-O' });
    expect(move(ready, 'e1g1').fenAfter.split(' ')[0]).toContain('R4RK1');
    expect(move(ready, 'e1c1')).toMatchObject({ san: 'O-O-O' });
    // The black rook covers f1, which the king would pass through.
    const attacked = 'r3k2r/8/8/8/8/8/5r2/R3K2R w KQkq - 0 1';
    expect(evaluateMove(attacked, { from: 'e1', to: 'g1' })).toEqual({ ok: false, reason: 'illegal_move' });
  });

  it('plays en passant only immediately after the double step', () => {
    const fen = play(STANDARD_START_FEN, 'e2e4', 'a7a6', 'e4e5', 'd7d5');
    const capture = move(fen, 'e5d6');
    expect(capture).toMatchObject({ san: 'exd6', captured: 'p' });
    expect(capture.fenAfter.split(' ')[0]).toBe('rnbqkbnr/1pp1pppp/p2P4/8/8/8/PPPP1PPP/RNBQKBNR');
    const later = play(fen, 'g1f3', 'g8f6');
    expect(evaluateMove(later, { from: 'e5', to: 'd6' })).toEqual({ ok: false, reason: 'illegal_move' });
  });

  it('requires an explicit promotion piece and supports every choice', () => {
    const fen = '8/P6k/8/8/8/8/8/K7 w - - 0 1';
    expect(evaluateMove(fen, { from: 'a7', to: 'a8' })).toEqual({ ok: false, reason: 'promotion_required' });
    for (const piece of ['q', 'r', 'b', 'n'] as const) {
      const promoted = move(fen, `a7a8${piece}`);
      expect(promoted.uci).toBe(`a7a8${piece}`);
      expect(promoted.promotion).toBe(piece);
      expect(promoted.fenAfter.startsWith(piece.toUpperCase())).toBe(true);
    }
    expect(evaluateMove(STANDARD_START_FEN, { from: 'e2', to: 'e4', promotion: 'q' })).toEqual({
      ok: false,
      reason: 'promotion_not_allowed',
    });
  });
});

describe('Legal destination map', () => {
  it('matches chess.js verbose move generation over random games, including special moves', () => {
    let seed = 7;
    const random = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    let checked = 0;
    const starts = [
      'r3k2r/pppqbppp/2np1n2/4p3/4P3/2NP1N2/PPPQBPPP/R3K2R w KQkq - 0 1', // both castlings
      'rnbqkbnr/1pp1pppp/p7/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3', // en passant
      '1n2k3/P1P5/8/8/8/8/5p1p/4K1N1 w - - 0 1', // promotions with and without capture
      '1n2k3/P1P5/8/8/8/8/5p1p/4K1N1 b - - 0 1',
    ];
    for (const fen of starts) {
      const reference = new Chess(fen);
      const expected: Record<string, string[]> = {};
      for (const m of reference.moves({ verbose: true }))
        if (!(expected[m.from] ??= []).includes(m.to)) expected[m.from].push(m.to);
      const sorted = (map: Record<string, string[]>) =>
        Object.fromEntries(Object.entries(map).map(([k, v]) => [k, [...v].sort()]).sort());
      expect(sorted(positionFacts(fen).legalMoves)).toEqual(sorted(expected));
    }
    for (let game = 0; game < 12; game++) {
      const reference = new Chess();
      for (let ply = 0; ply < 100 && !reference.isGameOver(); ply++) {
        const verbose = reference.moves({ verbose: true });
        const expected: Record<string, string[]> = {};
        for (const m of verbose) if (!(expected[m.from] ??= []).includes(m.to)) expected[m.from].push(m.to);
        const actual = positionFacts(reference.fen()).legalMoves;
        const normalize = (map: Record<string, string[]>) =>
          Object.fromEntries(Object.entries(map).map(([k, v]) => [k, [...v].sort()]).sort());
        expect(normalize(actual)).toEqual(normalize(expected));
        const pick = verbose[Math.floor(random() * verbose.length)];
        const evaluated = move(reference.fen(), `${pick.from}${pick.to}${pick.promotion ?? ''}`);
        reference.move(pick);
        expect(evaluated.fenAfter).toBe(reference.fen());
        expect(evaluated.san).toBe(pick.san);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(800);
  }, 60_000);
});

describe('Game endings', () => {
  it("detects checkmate (fool's mate) and reports the check square", () => {
    const fen = play(STANDARD_START_FEN, 'f2f3', 'e7e5', 'g2g4');
    const mate = move(fen, 'd8h4');
    expect(mate.san).toBe('Qh4#');
    expect(mate.outcome).toEqual({ winner: 'b', termination: 'checkmate' });
    expect(mate.after.checkSquare).toBe('e1');
    expect(mate.after.legalMoves).toEqual({});
  });

  it('detects stalemate', () => {
    const result = move('7k/8/6Q1/8/8/8/8/K7 w - - 0 1', 'g6f7');
    expect(result.outcome).toEqual({ winner: null, termination: 'stalemate' });
  });

  it('draws dead positions by insufficient material, but not every bishop ending', () => {
    const dead = { winner: null, termination: 'insufficient-material' };
    // K v K: the king captures the last (unprotected) rook.
    expect(move('8/8/8/8/8/8/2r5/2K4k w - - 0 1', 'c1c2').outcome).toEqual(dead);
    // K+N v K after the knight captures the queen; K+N v K+Q is not dead.
    expect(move('8/8/8/8/2q5/8/1N6/K6k w - - 0 1', 'b2c4').outcome).toEqual(dead);
    expect(move('8/8/8/8/2q5/8/1N6/K6k w - - 0 1', 'b2d3').outcome).toBeNull();
    // Bishops all on one square colour are dead; on opposite colours they are not.
    expect(move('8/8/8/8/8/2kb4/8/K4B2 w - - 0 1', 'f1e2').outcome).toEqual(dead);
    expect(move('8/8/8/8/8/2kb4/8/K1B5 w - - 0 1', 'c1b2').outcome).toBeNull();
  });

  it('applies threefold repetition and the fifty-move rule, with checkmate taking precedence', () => {
    expect(historyOutcome(STANDARD_START_FEN, 2)).toBeNull();
    expect(historyOutcome(STANDARD_START_FEN, 3)).toEqual({ winner: null, termination: 'threefold-repetition' });
    expect(historyOutcome('8/8/8/8/8/2k5/8/K1R5 w - - 99 80', 1)).toBeNull();
    expect(historyOutcome('8/8/8/8/8/2k5/8/K1R5 b - - 100 80', 1)).toEqual({
      winner: null,
      termination: 'fifty-move-rule',
    });
    // The hundredth quiet half-move delivers mate: mate stands.
    const mate = move('k7/8/1K6/8/8/8/8/7R w - - 99 90', 'h1h8');
    expect(mate.outcome).toEqual({ winner: 'w', termination: 'checkmate' });
  });

  it('keys repetition on placement, turn, castling and a legal en passant only', () => {
    // After d7d5 the d6 en passant capture is legal: the position differs from one without it.
    const withEp = play(STANDARD_START_FEN, 'e2e4', 'a7a6', 'e4e5', 'd7d5');
    expect(repetitionKey(withEp).endsWith(' d6')).toBe(true);
    // Here the e5 pawn is pinned to its king along the fifth rank, so the
    // capture is illegal and the position is identical to one without a double step.
    const pinned = '8/8/8/K2pP2r/8/8/8/7k w - d6 0 1';
    expect(repetitionKey(new Chess(pinned).fen())).toBe('8/8/8/K2pP2r/8/8/8/7k w - -');
    // Losing castling rights changes the identity.
    const rights = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';
    const kingWalk = play(rights, 'e1f1', 'e8f8', 'f1e1', 'f8e8');
    expect(repetitionKey(kingWalk)).not.toBe(repetitionKey(rights));
  });

  it('decides timeouts by whether the opponent could ever checkmate', () => {
    expect(cannotCheckmate('8/8/8/8/8/2k5/8/K1R5 w - - 0 1', 'b')).toBe(true);
    expect(cannotCheckmate('8/8/8/8/8/2k5/8/K1R5 w - - 0 1', 'w')).toBe(false);
    // A lone knight can still mate with the opponent's help when they have more material.
    expect(cannotCheckmate('8/8/8/8/8/2k5/2n5/K1R5 w - - 0 1', 'b')).toBe(false);
    expect(cannotCheckmate('8/8/8/8/8/2k5/2n5/K7 w - - 0 1', 'b')).toBe(true);
  });
});

describe('PGN', () => {
  it('writes headers, numbered movetext and the result', () => {
    const input = {
      white: 'Alice',
      black: 'Bob',
      startedAt: new Date('2026-10-26T10:00:00Z'),
      initialMs: 180_000,
      incrementMs: 2_000,
      initialFen: STANDARD_START_FEN,
      standardStart: true,
      sans: ['f3', 'e5', 'g4', 'Qh4#'],
      outcome: { winner: 'b', termination: 'checkmate' } as const,
    };
    const pgn = buildPgn(input);
    expect(pgn).toContain('[TimeControl "180+2"]');
    expect(pgn).toContain('[Result "0-1"]');
    expect(pgn.trim().endsWith('1. f3 e5 2. g4 Qh4# 0-1')).toBe(true);
    const replay = new Chess();
    replay.loadPgn(pgn);
    expect(replay.isCheckmate()).toBe(true);
    // Tag values escape quotes and backslashes as the PGN standard requires.
    expect(buildPgn({ ...input, black: 'Bo"b\\' })).toContain('[Black "Bo\\"b\\\\"]');
  });
});
