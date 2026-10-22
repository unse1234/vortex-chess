import { twMerge } from "tailwind-merge";

type ClassValue = string | false | null | undefined;

/**
 * Joins truthy class names; when Tailwind utilities conflict (e.g. two
 * letter-spacing values), the one passed last wins regardless of CSS order.
 */
export function cn(...classes: ClassValue[]): string {
  return twMerge(classes.filter(Boolean).join(" "));
}
