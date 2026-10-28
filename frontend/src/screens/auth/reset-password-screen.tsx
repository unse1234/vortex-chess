"use client";

import { useEffect, useSyncExternalStore } from "react";
import { KeyIcon } from "@/components/ui/icons";
import { ResetPasswordForm } from "@/features/auth/components/reset-password-form";
import { readResetToken } from "@/features/auth/schemas/password-recovery.schema";
import { RecoveryFrame } from "@/screens/auth/recovery-frame";

/**
 * The token arrives in the URL fragment, which browsers never send to servers
 * or in Referer headers. It is read once, kept only in memory and removed from
 * the address bar and history.
 */
let captured: string | null = null;
/** A new link opened in the same tab only changes the fragment. */
function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}
const readToken = () => readResetToken(window.location.hash) ?? captured;

export function ResetPasswordScreen() {
  // undefined while server rendering: the fragment is only visible in the browser.
  const token = useSyncExternalStore(subscribe, readToken, () => undefined);

  useEffect(() => {
    if (!token) return;
    captured = token;
    if (window.location.hash)
      window.history.replaceState(window.history.state, "", window.location.pathname);
    return () => {
      captured = null;
    };
  }, [token]);

  return (
    <RecoveryFrame
      icon={<KeyIcon className="text-[34px]" />}
      eyebrow="ACCESS KEY RESET"
      title="Choose a new password"
      description="Your new password replaces the old one and signs you out on every device."
    >
      {token === undefined ? null : <ResetPasswordForm key={token ?? "none"} token={token} />}
    </RecoveryFrame>
  );
}
