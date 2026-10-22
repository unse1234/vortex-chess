import { z } from "zod";

/** Input-shape checks for usability; the backend validates credentials. */
export const signInSchema = z.object({
  email: z
    .string()
    .trim()
    .max(254)
    .pipe(z.email({ error: "Enter a valid email address." })),
  password: z
    .string()
    .min(1, { error: "Enter your password." })
    .max(128, { error: "Use at most 128 characters." }),
  remember: z.boolean(),
});

export type SignInFormValues = z.infer<typeof signInSchema>;
