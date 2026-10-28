import { z } from 'zod';
import { RATING_POOLS } from './rating-policy';
export const emptyQuerySchema = z.object({}).strict();
export const poolSchema = z.enum(RATING_POOLS);
export const leaderboardSchema = z
  .object({
    pool: poolSchema,
    page: z.coerce.number().int().min(1).max(1_000_000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();
export const positionSchema = z.object({ pool: poolSchema }).strict();
export const ratingHistorySchema = z
  .object({
    pool: poolSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    cursor: z.string().min(1).max(200).optional(),
  })
  .strict();
export type LeaderboardInput = z.infer<typeof leaderboardSchema>;
export type RatingHistoryInput = z.infer<typeof ratingHistorySchema>;
