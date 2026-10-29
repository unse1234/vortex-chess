import { z } from 'zod';
import { uuidSchema } from '../rooms/rooms.schemas';

export const socialPageSchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().max(160).optional(),
    search: z
      .string()
      .trim()
      .max(20)
      .regex(/^[a-zA-Z0-9_]*$/)
      .default(''),
  })
  .strict();
export type SocialPageInput = z.infer<typeof socialPageSchema>;
export const requestListSchema = socialPageSchema.extend({
  direction: z.enum(['incoming', 'outgoing']),
});
export const socialUserIdSchema = uuidSchema.transform((id) =>
  id.toLowerCase(),
);
export const sendRequestSchema = z
  .object({ userId: socialUserIdSchema })
  .strict();
export const searchUsersSchema = socialPageSchema.extend({
  search: z
    .string()
    .trim()
    .min(2)
    .max(20)
    .regex(/^[a-zA-Z0-9_]+$/),
});
