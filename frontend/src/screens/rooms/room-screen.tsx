"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { Skeleton } from "@/components/feedback/skeleton";
import { useToast } from "@/components/feedback/toast";
import { Panel } from "@/components/layout/panel";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { CloseIcon, MailIcon, RoomIcon, SettingsIcon, SwordsIcon } from "@/components/ui/icons";
import { routes } from "@/config/routes";
import { InvitePlayerForm } from "@/features/invitations/components/invite-player-form";
import { RoomInvitationList } from "@/features/invitations/components/room-invitation-list";
import { ColorPreferencePicker } from "@/features/rooms/components/color-preference-picker";
import { RoomSeatCard } from "@/features/rooms/components/room-seat-card";
import { RoomStatusBadge } from "@/features/rooms/components/room-status-badge";
import { TimeControlPicker } from "@/features/rooms/components/time-control-picker";
import { useRoomCommands } from "@/features/rooms/hooks/use-room-commands";
import { useRoomOptionsQuery } from "@/features/rooms/hooks/use-room-options-query";
import { useRoomSession } from "@/features/rooms/hooks/use-room-session";
import type { RoomSnapshot } from "@/features/rooms/types/room.types";
import { useNow } from "@/hooks/use-now";
import { ApiError } from "@/lib/http/api-error";
import { RoomPageHeader } from "@/screens/rooms/room-page-header";
import { useGameStartAudio } from "@/screens/rooms/use-game-start-audio";
import { formatTimeUntil } from "@/utils/format-time-until";

/** Waiting room: seats, readiness, settings and invitations, kept live by the room channel. */
export function RoomScreen({ roomId }: { roomId: string }) {
  const onStarted = useGameStartAudio();
  const { query, connection, readinessReset, dismissReadinessReset } = useRoomSession(roomId, onStarted);
  const room = query.data;

  return (
    <>
      <RoomPageHeader live={room ? connection : undefined} />
      <main id="main-content" tabIndex={-1} className="flex-1 px-4 py-6 focus:outline-none sm:px-6 lg:px-10 xl:overflow-y-auto">
        <div className="mx-auto max-w-5xl">
          {room ? (
            <WaitingRoom room={room} readinessReset={readinessReset} onDismissReset={dismissReadinessReset} />
          ) : query.isError ? (
            query.error instanceof ApiError && query.error.status === 404 ? (
              <EmptyState
                icon={<RoomIcon />}
                title="Room unavailable"
                description="This room doesn't exist, or you're not one of its players."
                action={<Link href={routes.play} className="font-semibold text-accent hover:underline">Back to the lobby</Link>}
                className="py-16"
              />
            ) : (
              <ErrorState title="Couldn't load the room" message={query.error.message} onRetry={() => query.refetch()} retrying={query.isRefetching} />
            )
          ) : (
            <RoomSkeleton />
          )}
        </div>
      </main>
    </>
  );
}

function WaitingRoom({
  room,
  readinessReset,
  onDismissReset,
}: {
  room: RoomSnapshot;
  readinessReset: boolean;
  onDismissReset: () => void;
}) {
  const router = useRouter();
  const showToast = useToast();
  const now = useNow();
  const options = useRoomOptionsQuery();
  const onStarted = useGameStartAudio();
  const commands = useRoomCommands(room.id, onStarted);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const { viewer, seats, settings } = room;
  const isHost = viewer.role === "host";
  const closed = room.status === "cancelled" || room.status === "expired";
  const myReady = isHost ? seats.host.ready : (seats.challenger?.ready ?? false);
  const settingsPending = commands.updateSettings.isPending;
  const commandError =
    commands.updateSettings.error ?? commands.setReady.error ?? commands.start.error ?? commands.cancel.error ?? commands.leave.error;
  const startedGameId = room.status === "started" ? room.gameId : null;

  // Both players are sent to the game when the room reports it, whether from
  // the start response, the realtime update or a reload of this page.
  useEffect(() => {
    if (startedGameId) router.replace(routes.game(startedGameId));
  }, [startedGameId, router]);
  const selectedPreset = options.data?.timeControls.find(
    (preset) => preset.initialMs === settings.timeControl.initialMs && preset.incrementMs === settings.timeControl.incrementMs,
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-accent">Private room</p>
          <h1 className="mt-1 flex flex-wrap items-center gap-3 text-2xl font-bold text-fg">
            Waiting room <RoomStatusBadge status={room.status} />
          </h1>
        </div>
        {!closed && now !== null ? (
          <p className="text-[13px] text-fg-muted">Room closes {formatTimeUntil(room.expiresAt, now)}</p>
        ) : null}
      </div>

      {closed ? (
        <p role="status" className="rounded-md border border-line-strong bg-surface-raised px-4 py-3 text-[14px] text-fg-muted">
          {room.status === "cancelled" ? "The host cancelled this room." : "This room has expired."}{" "}
          <Link href={routes.play} className="font-semibold text-accent hover:underline">Back to the lobby</Link>
        </p>
      ) : null}
      {startedGameId ? (
        <p role="status" className="rounded-md border border-accent-line bg-accent-soft px-4 py-3 text-[14px] text-accent">
          The game has started. Opening the board…{" "}
          <Link href={routes.game(startedGameId)} className="font-semibold underline">Open game</Link>
        </p>
      ) : null}
      {readinessReset && !closed && !isHost ? (
        <p role="status" className="flex items-start gap-3 rounded-md border border-accent-line bg-accent-soft px-4 py-3 text-[14px] text-accent">
          <span className="flex-1">The host changed the settings, so readiness was reset. Review them and confirm again.</span>
          <button type="button" onClick={onDismissReset} aria-label="Dismiss" className="text-lg"><CloseIcon /></button>
        </p>
      ) : null}
      {commandError ? (
        <p role="alert" className="rounded-md border border-danger-line bg-danger-soft px-4 py-3 text-[14px] text-danger">
          {commandError.message}
        </p>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-5">
          <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-stretch">
            <RoomSeatCard label="Host" seat={seats.host} isViewer={isHost} />
            <span aria-hidden className="flex items-center justify-center text-2xl text-fg-subtle"><SwordsIcon /></span>
            <RoomSeatCard
              label="Challenger"
              seat={seats.challenger}
              isViewer={!isHost}
              emptyContent={
                viewer.canInvite ? <InvitePlayerForm roomId={room.id} /> : closed ? null : <p className="text-[13px] text-fg-subtle">The host can invite a registered player.</p>
              }
            />
          </div>

          <Panel title="Ready check" icon={<SwordsIcon />}>
            <div className="flex flex-wrap items-center gap-3">
              <p className="min-w-0 flex-1 text-[14px] text-fg-muted">
                {startedGameId
                  ? "The game is under way."
                  : closed
                  ? "This room is closed."
                  : !seats.challenger
                    ? "Readiness opens once a challenger joins."
                    : room.status === "ready"
                      ? "Both players are ready."
                      : myReady
                        ? "You're ready. Waiting for the other player."
                        : "Confirm when you're happy with the settings."}
              </p>
              {viewer.canSetReady ? (
                <Button
                  variant={myReady ? "secondary" : "primary"}
                  disabled={commands.setReady.isPending || settingsPending}
                  onClick={() => commands.setReady.mutate({ expectedRevision: room.revision, ready: !myReady })}
                >
                  {commands.setReady.isPending ? "Saving…" : myReady ? "Not ready" : "I'm ready"}
                </Button>
              ) : null}
              {isHost ? (
                <Button
                  variant="primary"
                  disabled={!viewer.canStart || commands.start.isPending}
                  aria-describedby="match-start-status"
                  onClick={() => commands.start.mutate({ expectedRevision: room.revision })}
                >
                  {commands.start.isPending ? "Starting…" : "Start match"}
                </Button>
              ) : null}
            </div>
            {!closed && !startedGameId ? (
              <p id="match-start-status" className="mt-2 text-[12px] text-fg-subtle">
                {isHost
                  ? viewer.canStart
                    ? "Starting creates the game with these settings; they can't change afterwards."
                    : "Start opens once both players are ready."
                  : "The host starts the game once you're both ready."}
              </p>
            ) : null}
          </Panel>

          {isHost ? (
            <Panel title="Invitations" icon={<MailIcon />}>
              <RoomInvitationList roomId={room.id} enabled={isHost} />
            </Panel>
          ) : null}
        </div>

        <div className="flex flex-col gap-5">
          <Panel title="Settings" icon={<SettingsIcon />} busy={options.isPending || settingsPending}>
            {options.data ? (
              <div className="flex flex-col gap-6">
                <TimeControlPicker
                  name={`room-${room.id}-time`}
                  presets={options.data.timeControls}
                  value={selectedPreset?.id ?? ""}
                  disabled={!viewer.canEditSettings || settingsPending}
                  onChange={(id) => {
                    const preset = options.data.timeControls.find((p) => p.id === id);
                    if (preset)
                      commands.updateSettings.mutate({
                        expectedRevision: room.revision,
                        change: { timeControl: { initialMs: preset.initialMs, incrementMs: preset.incrementMs } },
                      });
                  }}
                />
                <ColorPreferencePicker
                  name={`room-${room.id}-color`}
                  options={options.data.colorPreferences}
                  value={settings.colorPreference}
                  disabled={!viewer.canEditSettings || settingsPending}
                  onChange={(colorPreference) =>
                    commands.updateSettings.mutate({ expectedRevision: room.revision, change: { colorPreference } })
                  }
                />
                <p className="text-[12px] text-fg-subtle">
                  {viewer.canEditSettings
                    ? "Changing a setting resets both players' readiness."
                    : closed
                      ? "Settings are final."
                      : "Only the host can change settings."}
                </p>
              </div>
            ) : options.isError ? (
              <ErrorState title="Couldn't load settings" message={options.error.message} onRetry={() => options.refetch()} />
            ) : (
              <Skeleton className="h-40 w-full" />
            )}
          </Panel>

          {viewer.canCancel ? (
            <Button variant="danger" onClick={() => setConfirmCancel(true)}>Cancel room</Button>
          ) : null}
          {viewer.canLeave ? (
            <Button
              variant="secondary"
              disabled={commands.leave.isPending}
              onClick={() =>
                commands.leave.mutate(undefined, {
                  onSuccess: () => {
                    showToast({ title: "You left the room" });
                    router.push(routes.play);
                  },
                })
              }
            >
              {commands.leave.isPending ? "Leaving…" : "Leave room"}
            </Button>
          ) : null}
        </div>
      </div>

      <Dialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title="Cancel this room?"
        description="Pending invitations are cancelled and the challenger is notified. This can't be undone."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmCancel(false)}>Keep room</Button>
            <Button
              variant="danger"
              disabled={commands.cancel.isPending}
              onClick={() => commands.cancel.mutate(undefined, { onSettled: () => setConfirmCancel(false) })}
            >
              {commands.cancel.isPending ? "Cancelling…" : "Cancel room"}
            </Button>
          </>
        }
      >
        <span />
      </Dialog>
    </div>
  );
}

function RoomSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading room">
      <Skeleton className="h-12 w-64" />
      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
        <Skeleton className="h-72 w-full" />
      </div>
    </div>
  );
}
