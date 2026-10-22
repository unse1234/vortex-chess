"use client";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { appConfig } from "@/config/app";
import { useSignOut } from "@/features/auth/hooks/use-sign-out";

type SignOutDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSignedOut: () => void;
  /** Explains that authentication is simulated in development builds. */
  previewNotice?: string;
};

export function SignOutDialog({ open, onOpenChange, onSignedOut, previewNotice }: SignOutDialogProps) {
  const signOut = useSignOut({
    onSuccess: () => {
      onOpenChange(false);
      onSignedOut();
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!signOut.isPending) onOpenChange(next);
      }}
      title={`Exit ${appConfig.name}?`}
      description="You'll be signed out on this device. Active games and rooms aren't affected."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} data-autofocus>
            Stay
          </Button>
          <Button variant="primary" onClick={() => signOut.mutate()} disabled={signOut.isPending}>
            {signOut.isPending ? "Signing out…" : "Sign out"}
          </Button>
        </>
      }
    >
      <div className="space-y-3 px-5 py-4 text-[13px] leading-relaxed text-fg-muted">
        {previewNotice ? (
          <p className="rounded-md bg-accent-soft px-3 py-2 text-accent">{previewNotice}</p>
        ) : null}
        {signOut.isError ? (
          <p role="alert" className="text-danger">
            {signOut.error.message}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
