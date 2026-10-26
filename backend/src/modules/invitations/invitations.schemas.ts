import { z } from 'zod';
import { usernameSchema } from '../auth/auth.schemas';

/** Username or email; emails are recognised by "@" and normalized like sign-up. */
export const recipientSchema = z
  .string()
  .trim()
  .min(1, 'Enter a username or email.')
  .max(254)
  .transform((value, ctx) => {
    if (value.includes('@')) {
      const email = z.email().safeParse(value.toLowerCase());
      if (email.success)
        return { kind: 'EMAIL' as const, email: email.data };
      ctx.addIssue({ code: 'custom', message: 'Enter a valid email address.' });
      return z.NEVER;
    }
    const username = usernameSchema.safeParse(value);
    if (username.success)
      return {
        kind: 'USERNAME' as const,
        usernameKey: username.data.toLowerCase(),
      };
    ctx.addIssue({
      code: 'custom',
      message: 'Enter a username (3-20 letters, numbers or underscores) or an email.',
    });
    return z.NEVER;
  });

export const createInvitationSchema = z
  .object({ recipient: recipientSchema })
  .strict();
export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;

export const listInvitationsSchema = z
  .object({
    role: z.enum(['received', 'sent']).default('received'),
    status: z.enum(['pending', 'all']).default('pending'),
    cursor: z.string().max(200).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
export type ListInvitationsInput = z.infer<typeof listInvitationsSchema>;
