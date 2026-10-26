import { Injectable } from '@nestjs/common';
import { Chess } from 'chess.js';
import { PrismaService } from '../../../database/prisma.service';
import { ApiException } from '../../../common/errors/api-exception';
import {
  analysisPreviewSchema,
  type AnalysisPreviewInput,
} from '../games.schemas';
import { positionFacts } from '../rules/chess-rules';

type RecordedPosition = {
  initialFen: string;
  moves: { ply: number; uci: string; san: string; fenAfter: string }[];
};

/** A fresh rules instance per request. No live runtime, commands, clocks or publisher. */
export function previewVariation(
  game: RecordedPosition,
  input: AnalysisPreviewInput,
) {
  if (input.basePly > game.moves.length)
    throw new ApiException(
      400,
      'invalid_base_ply',
      'Choose a recorded position.',
    );
  let chess: Chess;
  try {
    chess = new Chess(game.initialFen);
  } catch {
    throw new ApiException(
      503,
      'game_integrity_error',
      'The recorded initial position could not be reconstructed.',
    );
  }
  const apply = (uci: string) =>
    chess.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      ...(uci[4] ? { promotion: uci[4] } : {}),
    });
  for (let i = 0; i < input.basePly; i++) {
    const recorded = game.moves[i];
    try {
      const move = apply(recorded.uci);
      if (
        recorded.ply !== i + 1 ||
        move.after !== recorded.fenAfter ||
        move.san !== recorded.san
      )
        throw new Error('Record mismatch');
    } catch {
      throw new ApiException(
        503,
        'game_integrity_error',
        'The recorded game could not be reconstructed.',
      );
    }
  }
  const moves = input.path.map((uci, index) => {
    try {
      const move = apply(uci);
      // chess.js tolerates an unnecessary promotion suffix on a non-pawn move.
      if (`${move.from}${move.to}${move.promotion ?? ''}` !== uci)
        throw new Error('Invalid promotion');
      return {
        uci,
        san: move.san,
        fen: move.after,
        from: move.from,
        to: move.to,
        ply: input.basePly + index + 1,
      };
    } catch {
      throw new ApiException(
        422,
        'illegal_analysis_move',
        `Variation move ${index + 1} is illegal.`,
      );
    }
  });
  return {
    basePly: input.basePly,
    moves,
    fen: chess.fen(),
    ...positionFacts(chess.fen()),
  };
}

@Injectable()
export class AnalysisPreviewService {
  constructor(private readonly prisma: PrismaService) {}

  async preview(userId: string, gameId: string, input: AnalysisPreviewInput) {
    const parsed = analysisPreviewSchema.safeParse(input);
    if (!parsed.success)
      throw new ApiException(400, 'validation_error', 'Invalid analysis path.');
    const game = await this.prisma.game.findFirst({
      where: { id: gameId, participants: { some: { userId } } },
      select: {
        status: true,
        initialFen: true,
        moves: {
          orderBy: { ply: 'asc' },
          take: parsed.data.basePly,
          select: { ply: true, uci: true, san: true, fenAfter: true },
        },
      },
    });
    if (!game)
      throw new ApiException(
        404,
        'game_not_found',
        'This game is unavailable.',
      );
    if (game.status !== 'FINISHED')
      throw new ApiException(
        409,
        'analysis_requires_finished_game',
        'Manual analysis is available after the game finishes.',
      );
    return previewVariation(game, parsed.data);
  }
}
