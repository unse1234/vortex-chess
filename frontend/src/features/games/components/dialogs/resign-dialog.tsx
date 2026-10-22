"use client";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

type ResignDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  pending: boolean;
};

export function ResignDialog({ open, onOpenChange, onConfirm, pending }: ResignDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
      title="Resign this game?"
      description="Resigning ends the game immediately and counts as a loss."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} data-autofocus>
            Keep playing
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={pending}>
            {pending ? "Resigning…" : "Resign"}
          </Button>
        </>
      }
    >
      <p className="px-5 py-4 text-[13px] leading-relaxed text-fg-muted">This can&apos;t be undone.</p>
    </Dialog>
  );
}
