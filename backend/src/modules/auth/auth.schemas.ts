import { z } from 'zod';
export const usernameSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_]{3,20}$/, 'Use 3-20 letters, numbers or underscores.');
const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email('Enter a valid email address.'));
const password = z
  .string()
  .min(8, 'Use at least 8 characters.')
  .max(128, 'Use at most 128 characters.');
export const registerSchema = z
  .object({
    username: usernameSchema,
    email,
    password,
    confirmPassword: z.string().max(128),
    acceptTerms: z.literal(true),
  })
  .strict()
  .refine((v) => v.password === v.confirmPassword, {
    path: ['confirmPassword'],
    message: "Passwords don't match.",
  });
export const loginSchema = z
  .object({
    email,
    password: z.string().min(1).max(128),
    remember: z.boolean().default(false),
  })
  .strict();
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
