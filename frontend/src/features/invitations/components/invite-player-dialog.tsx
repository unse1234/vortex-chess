"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { TextField } from "@/components/ui/text-field";
import { inviteFormSchema, type InviteFormValues } from "@/features/invitations/schemas/invite-recipient.schema";

type InvitePlayerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialRecipient?: string;
  onContinue: (recipient: string) => void;
};

/** "Play with friends": choose a registered player, then set up the room. */
export function InvitePlayerDialog({ open, onOpenChange, initialRecipient = "", onContinue }: InvitePlayerDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Play with friends"
      description="Invite a registered player by their username or email. You'll choose the time control and colour next."
    >
      {/* Mounted only while open, so the field resets on every opening. */}
      <InvitePlayerDialogForm initialRecipient={initialRecipient} onCancel={() => onOpenChange(false)} onContinue={onContinue} />
    </Dialog>
  );
}

function InvitePlayerDialogForm({
  initialRecipient,
  onCancel,
  onContinue,
}: {
  initialRecipient: string;
  onCancel: () => void;
  onContinue: (recipient: string) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<InviteFormValues>({
    resolver: zodResolver(inviteFormSchema),
    defaultValues: { recipient: initialRecipient },
  });
  return (
    <form noValidate className="flex h-full flex-col" onSubmit={handleSubmit(({ recipient }) => onContinue(recipient))}>
      <div className="px-5 py-5">
        <TextField
          label="Username or email"
          placeholder="username or name@example.com"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          hint="Only registered players can be invited. Their email address is never shown to you."
          error={errors.recipient?.message}
          data-autofocus
          {...register("recipient")}
        />
      </div>
      <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface px-5 py-4">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary">
          Continue to room setup
        </Button>
      </div>
    </form>
  );
}
