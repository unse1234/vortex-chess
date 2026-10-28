import { z } from 'zod';
import { createRoomSchema } from '../rooms/rooms.schemas';

export const joinMatchmakingSchema = createRoomSchema
  .pick({ timeControl: true })
  .strict();
export const searchCommandSchema = z.object({ searchId: z.uuid() }).strict();
export type JoinMatchmakingInput = z.infer<typeof joinMatchmakingSchema>;
export type SearchCommandInput = z.infer<typeof searchCommandSchema>;
