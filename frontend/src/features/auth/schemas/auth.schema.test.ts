import { describe, expect, it } from "vitest";
import { signInSchema } from "@/features/auth/schemas/sign-in.schema";
import { signUpSchema } from "@/features/auth/schemas/sign-up.schema";

describe("V1 authentication input", () => {
  it("requires an email and password and trims the email", () => {
    expect(signInSchema.parse({ email: " player@example.com ", password: "secret", remember: true }).email).toBe("player@example.com");
    for (const email of ["HaseebAli", "HaseebAli#1337", "invalid@", ""]) {
      expect(signInSchema.safeParse({ email, password: "secret", remember: true }).success).toBe(false);
    }
    expect(signInSchema.safeParse({ identifier: "player@example.com", password: "secret", remember: true }).success).toBe(false);
    expect(signInSchema.safeParse({ email: "player@example.com", password: "", remember: true }).success).toBe(false);
  });

  it("keeps username and password confirmation required without deferred preferences", () => {
    const input = { username: "player_1", email: "player@example.com", password: "password123", confirmPassword: "password123", acceptTerms: true };
    expect(signUpSchema.safeParse(input).success).toBe(true);
    expect(signUpSchema.safeParse({ ...input, username: "" }).success).toBe(false);
    expect(signUpSchema.safeParse({ ...input, confirmPassword: "different" }).success).toBe(false);
    expect(signUpSchema.safeParse({ ...input, confirmPassword: "" }).success).toBe(false);
    expect(signUpSchema.safeParse({ ...input, email: "username" }).success).toBe(false);
  });
});
