export type PasswordStrength = {
  /** 0–100 estimate used only for input guidance; the server enforces policy. */
  score: number;
  label: "AWAITING INPUT" | "WEAK" | "MODERATE" | "STRONG" | "MILITARY-GRADE";
  tone: "idle" | "danger" | "warning" | "success";
};

const LENGTH_TARGET = 20;

/** Rough client-side estimate from length and character variety. */
export function estimatePasswordStrength(password: string): PasswordStrength {
  if (!password) return { score: 0, label: "AWAITING INPUT", tone: "idle" };

  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((pattern) =>
    pattern.test(password),
  ).length;
  const uniqueRatio = new Set(password).size / password.length;

  const lengthPoints = (Math.min(password.length, LENGTH_TARGET) / LENGTH_TARGET) * 60;
  const varietyPoints = classes * 10;
  const repetitionPenalty = uniqueRatio < 0.5 ? 15 : 0;
  const score = Math.round(Math.max(0, Math.min(100, lengthPoints + varietyPoints - repetitionPenalty)));

  if (score < 40) return { score, label: "WEAK", tone: "danger" };
  if (score < 65) return { score, label: "MODERATE", tone: "warning" };
  if (score < 90) return { score, label: "STRONG", tone: "success" };
  return { score, label: "MILITARY-GRADE", tone: "success" };
}
