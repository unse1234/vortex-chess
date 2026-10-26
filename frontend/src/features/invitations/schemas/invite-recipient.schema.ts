import { z } from "zod";

const USERNAME = /^[A-Za-z0-9_]{3,20}$/;

/** Shape check only: the backend resolves the account and reports unknown players. */
export const inviteRecipientSchema = z
  .string()
  .trim()
  .min(1, "Enter a username or email.")
  .max(254, "That is too long for a username or email.")
  .refine(
    (value) => (value.includes("@") ? z.email().safeParse(value).success : USERNAME.test(value)),
    "Enter a username (3-20 letters, numbers or underscores) or an email address.",
  );

export const inviteFormSchema = z.object({ recipient: inviteRecipientSchema });
export type InviteFormValues = z.infer<typeof inviteFormSchema>;
