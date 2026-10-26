import { z } from 'zod';
import { createRoomSchema } from '../rooms/rooms.schemas';

const uuid = z.uuid('Use a valid identifier.');
const square = z.string().regex(/^[a-h][1-8]$/, 'Use a board square such as e4.');

export const gameIdSchema = uuid;

export const moveCommandSchema = z
  .object({
    requestId: uuid,
    expectedRevision: z.number().int().min(1).max(2_147_483_647),
    from: square,
    to: square,
    promotion: z.enum(['q', 'r', 'b', 'n']).optional(),
  })
  .strict();

export const simpleCommandSchema = z.object({ requestId: uuid }).strict();

export const drawResponseSchema = z
  .object({ requestId: uuid, response: z.enum(['accept', 'decline']) })
  .strict();

/** Realtime commands name their game in the payload; HTTP commands in the path. */
const withGame = <T extends z.ZodRawShape>(schema: z.ZodObject<T>) =>
  schema.extend({ gameId: uuid }).strict();
export const realtimeMoveSchema = withGame(moveCommandSchema);
export const realtimeSimpleSchema = withGame(simpleCommandSchema);
export const realtimeDrawResponseSchema = withGame(drawResponseSchema);

export type MoveCommandInput = z.infer<typeof moveCommandSchema>;
export type SimpleCommandInput = z.infer<typeof simpleCommandSchema>;
export type DrawResponseInput = z.infer<typeof drawResponseSchema>;

export const gameHistorySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().min(1).max(200).optional(),
  side: z.enum(['w', 'b']).optional(),
  result: z.enum(['win', 'loss', 'draw']).optional(),
}).strict();
export type GameHistoryInput = z.infer<typeof gameHistorySchema>;

export const analysisPreviewSchema = z.object({
  basePly: z.number().int().min(0).max(20_000),
  path: z.array(z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/)).max(128),
}).strict();
export type AnalysisPreviewInput = z.infer<typeof analysisPreviewSchema>;

/** Engine games reuse the room setup contract: a supported preset and a colour preference. */
export const createEngineGameSchema = createRoomSchema;
export type CreateEngineGameInput = z.infer<typeof createEngineGameSchema>;
