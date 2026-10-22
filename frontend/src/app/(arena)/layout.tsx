import type { ReactNode } from "react";
import { ArenaShell } from "@/screens/shells/arena-shell";
import { designFontClassName } from "@/styles/fonts";

export default function ArenaLayout({ children }: { children: ReactNode }) {
  return <ArenaShell className={designFontClassName}>{children}</ArenaShell>;
}
