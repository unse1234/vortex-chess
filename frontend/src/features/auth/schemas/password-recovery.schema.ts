import { z } from "zod";
import { MIN_PASSWORD_LENGTH } from "@/features/auth/schemas/sign-up.schema";

/** Input-shape checks for usability; the backend enforces the real policy. */
export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .trim()
    .max(254)
    .pipe(z.email({ error: "Enter a valid email address." })),
});

export const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(MIN_PASSWORD_LENGTH, {
        error: `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
      })
      .max(128, { error: "Use at most 128 characters." }),
    confirmPassword: z.string().min(1, { error: "Repeat your new password." }).max(128),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ["confirmPassword"],
    error: "Passwords don't match.",
  });

export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

/** Reads `#token=…` from the emailed link; anything else is treated as no token. */
export function readResetToken(hash: string): string | null {
  const token = new URLSearchParams(hash.replace(/^#/, "")).get("token");
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}
