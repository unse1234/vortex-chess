"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ErrorState } from "@/components/feedback/error-state";
import { Skeleton } from "@/components/feedback/skeleton";
import { useToast } from "@/components/feedback/toast";
import { Panel } from "@/components/layout/panel";
import { Button } from "@/components/ui/button";
import { PersonIcon, RoomIcon } from "@/components/ui/icons";
import { TextField } from "@/components/ui/text-field";
import { routes } from "@/config/routes";
import { useSendInvitation } from "@/features/invitations/hooks/use-invitations";
import { inviteRecipientSchema } from "@/features/invitations/schemas/invite-recipient.schema";
import { ColorPreferencePicker } from "@/features/rooms/components/color-preference-picker";
import { TimeControlPicker } from "@/features/rooms/components/time-control-picker";
import { useCreateRoom } from "@/features/rooms/hooks/use-room-commands";
import { useRoomOptionsQuery } from "@/features/rooms/hooks/use-room-options-query";
import type { ColorPreference } from "@/features/rooms/types/room.types";
import { RoomPageHeader } from "@/screens/rooms/room-page-header";

/**
 * Room draft: nothing exists on the server until "Create room". An optional
 * recipient is invited right after the room is created.
 */
export function CreateRoomScreen({ initialRecipient }: { initialRecipient: string }) {
  const router = useRouter();
  const showToast = useToast();
  const options = useRoomOptionsQuery();
  const create = useCreateRoom();
  const invite = useSendInvitation();
  const [presetId, setPresetId] = useState<string | null>(null);
  const [color, setColor] = useState<ColorPreference>("random");
  const [recipient, setRecipient] = useState(initialRecipient);
  const [recipientError, setRecipientError] = useState<string>();

  const selectedId = presetId ?? options.data?.defaultTimeControlId ?? null;
  const preset = options.data?.timeControls.find((p) => p.id === selectedId);
  const busy = create.isPending || invite.isPending;

  async function submit() {
    if (!preset) return;
    const trimmed = recipient.trim();
    if (trimmed) {
      const parsed = inviteRecipientSchema.safeParse(trimmed);
      if (!parsed.success) return setRecipientError(parsed.error.issues[0]?.message);
    }
    setRecipientError(undefined);
    const room = await create.mutateAsync({
      timeControl: { initialMs: preset.initialMs, incrementMs: preset.incrementMs },
      colorPreference: color,
    });
    if (trimmed) {
      try {
        const sent = await invite.mutateAsync({ roomId: room.id, recipient: trimmed });
        showToast({ title: `Invitation sent to ${sent.recipient.username}` });
      } catch (error) {
        // The room exists either way; the waiting room lets the host try again.
        showToast({
          title: "Room created, but the invitation wasn't sent",
          description: error instanceof Error ? error.message : undefined,
        });
      }
    }
    router.push(routes.room(room.id));
  }

  return (
    <>
      <RoomPageHeader />
      <main id="main-content" tabIndex={-1} className="flex-1 px-4 py-6 focus:outline-none sm:px-6 lg:px-10 xl:overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-5">
          <div>
            <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-accent">Private room</p>
            <h1 className="mt-1 text-2xl font-bold text-fg">Create a room</h1>
            <p className="mt-1 text-[14px] text-fg-muted">Choose the settings, then invite a registered player. Only invited players can join.</p>
          </div>

          <form
            noValidate
            className="flex flex-col gap-5"
            onSubmit={(event) => {
              event.preventDefault();
              void submit().catch(() => undefined);
            }}
          >
            <Panel title="Settings" icon={<RoomIcon />} busy={options.isPending}>
              {options.isPending ? (
                <div className="flex flex-col gap-3">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-20 w-full" />
                </div>
              ) : options.isError ? (
                <ErrorState
                  title="Couldn't load room settings"
                  message={options.error.message}
                  onRetry={() => options.refetch()}
                  retrying={options.isRefetching}
                />
              ) : (
                <div className="flex flex-col gap-6">
                  <TimeControlPicker
                    name="time-control"
                    presets={options.data.timeControls}
                    value={selectedId ?? ""}
                    onChange={setPresetId}
                    disabled={busy}
                  />
                  <ColorPreferencePicker
                    name="color"
                    options={options.data.colorPreferences}
                    value={color}
                    onChange={setColor}
                    disabled={busy}
                  />
                  <p className="text-[12px] text-fg-subtle">
                    Rooms stay open for {options.data.roomTtlMinutes} minutes; invitations expire after {options.data.invitationTtlMinutes}.
                  </p>
                </div>
              )}
            </Panel>

            <Panel title="Opponent" icon={<PersonIcon />}>
              <TextField
                label="Invite by username or email (optional)"
                placeholder="username or name@example.com"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                value={recipient}
                onChange={(event) => {
                  setRecipient(event.target.value);
                  setRecipientError(undefined);
                }}
                hint="You can also invite players from the waiting room."
                error={recipientError}
                disabled={busy}
              />
            </Panel>

            {create.isError ? (
              <p role="alert" className="rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-[14px] text-danger">
                {create.error.message}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => router.push(routes.play)} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={!preset || busy}>
                {create.isPending ? "Creating…" : invite.isPending ? "Sending invitation…" : recipient.trim() ? "Create room and invite" : "Create room"}
              </Button>
            </div>
          </form>
        </div>
      </main>
    </>
  );
}
