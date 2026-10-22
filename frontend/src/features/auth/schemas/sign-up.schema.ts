import { z } from "zod";

export const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/;
export const MIN_PASSWORD_LENGTH = 8;

/** Input-shape checks for usability; the backend enforces the real policy. */
export const signUpSchema = z
  .object({
    username: z
      .string()
      .trim()
      .regex(USERNAME_PATTERN, {
        error: "Use 3–20 letters, numbers or underscores.",
      }),
    email: z
      .string()
      .trim()
      .max(254)
      .pipe(z.email({ error: "Enter a valid email address." })),
    password: z
      .string()
      .min(MIN_PASSWORD_LENGTH, {
        error: `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
      })
      .max(128, { error: "Use at most 128 characters." }),
    confirmPassword: z
      .string()
      .min(1, { error: "Repeat your password." })
      .max(128),
    acceptTerms: z.boolean().refine((accepted) => accepted, {
      error: "Accept the Terms of Use to continue.",
    }),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ["confirmPassword"],
    error: "Passwords don't match.",
  });

export type SignUpFormValues = z.infer<typeof signUpSchema>;
