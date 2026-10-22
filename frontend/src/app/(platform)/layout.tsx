import type { ReactNode } from "react";
import { PlatformShell } from "@/screens/shells/platform-shell";

export default function PlatformLayout({ children }: { children: ReactNode }) {
  return <PlatformShell>{children}</PlatformShell>;
}
