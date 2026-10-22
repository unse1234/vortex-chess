import type { ReactNode } from "react";
import { AuthShell } from "@/screens/shells/auth-shell";
import { designFontClassName } from "@/styles/fonts";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <AuthShell className={designFontClassName}>{children}</AuthShell>;
}
