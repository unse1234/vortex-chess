"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { SendIcon } from "@/components/ui/icons";
import { TextField } from "@/components/ui/text-field";
import { useSendInvitation } from "@/features/invitations/hooks/use-invitations";
import { inviteFormSchema, type InviteFormValues } from "@/features/invitations/schemas/invite-recipient.schema";
import { ApiError } from "@/lib/http/api-error";

/** Host's form for inviting a registered player to an existing room. */
export function InvitePlayerForm({ roomId, autoFocus = false }: { roomId: string; autoFocus?: boolean }) {
  const send = useSendInvitation();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<InviteFormValues>({ resolver: zodResolver(inviteFormSchema), defaultValues: { recipient: "" } });
  const serverError =
    send.error instanceof ApiError ? (send.error.fieldErrors.recipient?.[0] ?? send.error.message) : send.error?.message;

  return (
    <form
      noValidate
      className="flex flex-col gap-2"
      onSubmit={handleSubmit(({ recipient }) => {
        setSentTo(null);
        send.mutate(
          { roomId, recipient },
          {
            onSuccess: (invitation) => {
              setSentTo(invitation.recipient.username);
              reset();
            },
          },
        );
      })}
    >
      <div className="flex items-start gap-2">
        <TextField
          label="Invite by username or email"
          placeholder="username or name@example.com"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          className="flex-1"
          error={errors.recipient?.message ?? serverError}
          data-autofocus={autoFocus || undefined}
          {...register("recipient", { onChange: () => send.reset() })}
        />
        <Button type="submit" variant="primary" className="mt-[26px]" disabled={send.isPending}>
          <SendIcon aria-hidden className="text-base" />
          {send.isPending ? "Sending…" : "Invite"}
        </Button>
      </div>
      <p aria-live="polite" className="min-h-5 text-[13px] text-success">
        {sentTo ? `Invitation sent to ${sentTo}.` : ""}
      </p>
    </form>
  );
}
