"use client";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

type OfferDrawDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  pending: boolean;
};

/** Confirms sending a draw offer. */
export function OfferDrawDialog({ open, onOpenChange, onConfirm, pending }: OfferDrawDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
      title="Offer a draw?"
      description="Your opponent can accept, which ends the game as a draw, or decline."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onConfirm} disabled={pending} data-autofocus>
            {pending ? "Sending…" : "Offer draw"}
          </Button>
        </>
      }
    >
      <p className="px-5 py-4 text-[13px] leading-relaxed text-fg-muted">
        The game continues and your clock keeps running until they answer.
      </p>
    </Dialog>
  );
}

type IncomingDrawDialogProps = {
  open: boolean;
  /** Closing without answering leaves the offer pending. */
  onDismiss: () => void;
  onAccept: () => void;
  onDecline: () => void;
  pending: boolean;
};

/** Shown when the opponent offers a draw. */
export function IncomingDrawDialog({ open, onDismiss, onAccept, onDecline, pending }: IncomingDrawDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !pending) onDismiss();
      }}
      title="Your opponent offers a draw"
      description="Accepting ends the game immediately as a draw."
      footer={
        <>
          <Button variant="ghost" onClick={onDecline} disabled={pending}>
            Decline
          </Button>
          <Button variant="primary" onClick={onAccept} disabled={pending} data-autofocus>
            Accept draw
          </Button>
        </>
      }
    >
      <p className="px-5 py-4 text-[13px] leading-relaxed text-fg-muted">
        You can also close this and keep playing; the offer stays open until you answer or move.
      </p>
    </Dialog>
  );
}
