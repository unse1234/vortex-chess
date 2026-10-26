import { Chess } from 'chess.js';
import { analysisPreviewSchema, gameHistorySchema } from '../games.schemas';
import { STANDARD_START_FEN } from '../rules/chess-rules';
import {
  previewVariation,
  AnalysisPreviewService,
} from './analysis-preview.service';
import type { PrismaService } from '../../../database/prisma.service';

function recorded(ucis: string[], initialFen = STANDARD_START_FEN) {
  const chess = new Chess(initialFen);
  return {
    initialFen,
    moves: ucis.map((uci, i) => {
      const move = chess.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci[4],
      });
      return { ply: i + 1, uci, san: move.san, fenAfter: move.after };
    }),
  };
}

describe('isolated manual preview', () => {
  it('reconstructs the recorded prefix, ignores the later mate and leaves records untouched', () => {
    const game = recorded(['f2f3', 'e7e5', 'g2g4', 'd8h4']);
    const before = structuredClone(game);
    const preview = previewVariation(game, {
      basePly: 2,
      path: ['g2g3', 'b8c6'],
    });
    expect(preview.moves.map((m) => m.san)).toEqual(['g3', 'Nc6']);
    expect(preview.turn).toBe('w');
    expect(preview.legalMoves.f1).toContain('g2');
    expect(game).toEqual(before);
  });
  it('rejects invalid prefixes, record corruption, illegal paths and excess promotion suffixes', () => {
    expect(() =>
      previewVariation(
        { initialFen: 'invalid', moves: [] },
        { basePly: 0, path: [] },
      ),
    ).toThrow('reconstructed');
    expect(() =>
      previewVariation(recorded([]), { basePly: 1, path: [] }),
    ).toThrow('recorded position');
    const corrupt = recorded(['e2e4']);
    corrupt.moves[0].fenAfter = STANDARD_START_FEN;
    expect(() => previewVariation(corrupt, { basePly: 1, path: [] })).toThrow(
      'reconstructed',
    );
    for (const path of [['e2e5'], ['e2e4', 'e2e3'], ['g1f3q']])
      expect(() =>
        previewVariation(recorded([]), { basePly: 0, path }),
      ).toThrow('illegal');
  });
  it('supports both castlings, en passant and every promotion piece from saved initial state', () => {
    const castle = previewVariation(
      recorded([], 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1'),
      { basePly: 0, path: ['e1g1', 'e8c8'] },
    );
    expect(castle.moves.map((m) => m.san)).toEqual(['O-O', 'O-O-O']);
    const ep = previewVariation(recorded(['e2e4', 'a7a6', 'e4e5', 'd7d5']), {
      basePly: 4,
      path: ['e5d6'],
    });
    expect(ep.moves[0].san).toBe('exd6');
    expect(new Chess(ep.fen).get('d5')).toBeUndefined();
    for (const promotion of ['q', 'r', 'b', 'n']) {
      const result = previewVariation(
        recorded([], '7k/P7/8/8/8/8/8/7K w - - 0 1'),
        { basePly: 0, path: [`a7a8${promotion}`] },
      );
      expect(new Chess(result.fen).get('a8')?.type).toBe(promotion);
    }
  });
  it('rejects unknown, oversized and malformed payloads', () => {
    for (const input of [
      { basePly: -1, path: [] },
      { basePly: 0, path: Array(129).fill('e2e4') },
      { basePly: 0, path: ['O-O'] },
      { basePly: 0, path: [], fen: STANDARD_START_FEN },
    ])
      expect(analysisPreviewSchema.safeParse(input).success).toBe(false);
    expect(gameHistorySchema.safeParse({ limit: 51 }).success).toBe(false);
    expect(gameHistorySchema.safeParse({ sort: 'client' }).success).toBe(false);
  });
  it('enforces access and finished status without any write or live dependencies', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const service = new AnalysisPreviewService({
      game: { findFirst },
    } as unknown as PrismaService);
    await expect(
      service.preview('viewer', 'game', { basePly: 0, path: [] }),
    ).rejects.toMatchObject({ response: { code: 'game_not_found' } });
    expect(findFirst.mock.calls[0][0].where.participants).toEqual({
      some: { userId: 'viewer' },
    });
    findFirst.mockResolvedValue({ status: 'ACTIVE', ...recorded([]) });
    await expect(
      service.preview('viewer', 'game', { basePly: 0, path: [] }),
    ).rejects.toMatchObject({
      response: { code: 'analysis_requires_finished_game' },
    });
  });
});
