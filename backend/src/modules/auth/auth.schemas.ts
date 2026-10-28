import { z } from 'zod';
export const usernameSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_]{3,20}$/, 'Use 3-20 letters, numbers or underscores.');
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email('Enter a valid email address.'));
export const passwordSchema = z
  .string()
  .min(8, 'Use at least 8 characters.')
  .max(128, 'Use at most 128 characters.');
export const registerSchema = z
  .object({
    username: usernameSchema,
    email: emailSchema,
    password: passwordSchema,
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
    email: emailSchema,
    password: z.string().min(1).max(128),
    remember: z.boolean().default(false),
  })
  .strict();
export const forgotPasswordSchema = z.object({ email: emailSchema }).strict();
/** Token shape is checked by the service so malformed and unknown links fail identically. */
const resetToken = z.string().max(256);
export const resetPasswordSchema = z
  .object({
    token: resetToken,
    password: passwordSchema,
    confirmPassword: z.string().max(128),
  })
  .strict()
  .refine((v) => v.password === v.confirmPassword, {
    path: ['confirmPassword'],
    message: "Passwords don't match.",
  });
export const resetTokenStatusSchema = z.object({ token: resetToken }).strict();
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ResetTokenStatusInput = z.infer<typeof resetTokenStatusSchema>;
