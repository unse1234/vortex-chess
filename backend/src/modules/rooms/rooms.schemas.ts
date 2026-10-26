import { z } from 'zod';
import { findPreset } from './time-controls';

export const uuidSchema = z.uuid('Use a valid identifier.');
const revision = z.number().int().min(1).max(2_147_483_647);
const timeControl = z
  .object({
    initialMs: z.number().int(),
    incrementMs: z.number().int(),
  })
  .strict()
  .refine((v) => !!findPreset(v.initialMs, v.incrementMs), {
    message: 'Choose a supported time control.',
  });
const colorPreference = z.enum(['white', 'black', 'random']);

export const createRoomSchema = z
  .object({ timeControl, colorPreference: colorPreference.default('random') })
  .strict();
export const updateRoomSettingsSchema = z
  .object({
    expectedRevision: revision,
    timeControl: timeControl.optional(),
    colorPreference: colorPreference.optional(),
  })
  .strict()
  .refine((v) => v.timeControl || v.colorPreference, {
    message: 'Change at least one setting.',
    path: ['request'],
  });
export const readinessSchema = z
  .object({ expectedRevision: revision, ready: z.boolean() })
  .strict();
export const startRoomSchema = z.object({ expectedRevision: revision }).strict();

export type CreateRoomInput = z.infer<typeof createRoomSchema>;
export type UpdateRoomSettingsInput = z.infer<typeof updateRoomSettingsSchema>;
export type ReadinessInput = z.infer<typeof readinessSchema>;
export type StartRoomInput = z.infer<typeof startRoomSchema>;

export const toColorEnum = (value: z.infer<typeof colorPreference>) =>
  value.toUpperCase() as 'WHITE' | 'BLACK' | 'RANDOM';
