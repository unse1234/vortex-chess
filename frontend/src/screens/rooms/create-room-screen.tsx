"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ErrorState } from "@/components/feedback/error-state";
import { Skeleton } from "@/components/feedback/skeleton";
import { useToast } from "@/components/feedback/toast";
import { Panel } from "@/components/layout/panel";
import { Button } from "@/components/ui/button";
import { PersonIcon, RobotIcon, RoomIcon } from "@/components/ui/icons";
import { TextField } from "@/components/ui/text-field";
import { features } from "@/config/capabilities";
import { routes } from "@/config/routes";
import {
  activeEngineGameId,
  useCreateEngineGame,
  useEngineStatusQuery,
} from "@/features/games/hooks/use-engine-games";
import { useSendInvitation } from "@/features/invitations/hooks/use-invitations";
import { inviteRecipientSchema } from "@/features/invitations/schemas/invite-recipient.schema";
import { ColorPreferencePicker } from "@/features/rooms/components/color-preference-picker";
import { TimeControlPicker } from "@/features/rooms/components/time-control-picker";
import { useCreateRoom } from "@/features/rooms/hooks/use-room-commands";
import { useRoomOptionsQuery } from "@/features/rooms/hooks/use-room-options-query";
import type { ColorPreference } from "@/features/rooms/types/room.types";
import { RoomPageHeader } from "@/screens/rooms/room-page-header";
import { useGameStartAudio } from "@/screens/rooms/use-game-start-audio";

type Opponent = "player" | "engine";

/**
 * Game setup. With a player: nothing exists on the server until "Create
 * room", and an optional recipient is invited right after. Against the
 * engine (`?opponent=engine`): the same settings start an engine game
 * directly; its clock starts once the server has confirmed the engine.
 */
export function CreateRoomScreen({ initialRecipient, opponent = "player" }: { initialRecipient: string; opponent?: Opponent }) {
  const router = useRouter();
  const showToast = useToast();
  const options = useRoomOptionsQuery();
  const create = useCreateRoom();
  const invite = useSendInvitation();
  const engineMode = opponent === "engine" && features.enginePlay.available;
  const createEngineGame = useCreateEngineGame();
  const onStarted = useGameStartAudio();
  const [presetId, setPresetId] = useState<string | null>(null);
  const [color, setColor] = useState<ColorPreference>("random");
  const [recipient, setRecipient] = useState(initialRecipient);
  const [recipientError, setRecipientError] = useState<string>();

  const selectedId = presetId ?? options.data?.defaultTimeControlId ?? null;
  const preset = options.data?.timeControls.find((p) => p.id === selectedId);
  const busy = create.isPending || invite.isPending || createEngineGame.isPending;

  async function submitEngineGame() {
    if (!preset) return;
    const game = await createEngineGame.mutateAsync({
      timeControl: { initialMs: preset.initialMs, incrementMs: preset.incrementMs },
      colorPreference: color,
    });
    onStarted(game.id);
    router.push(routes.game(game.id));
  }

  async function submit() {
    if (!preset) return;
    if (engineMode) return submitEngineGame();
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

  const submitError = engineMode ? createEngineGame.error : create.error;
  const resumeGameId = engineMode ? activeEngineGameId(createEngineGame.error) : null;

  return (
    <>
      <RoomPageHeader />
      <main id="main-content" tabIndex={-1} className="flex-1 px-4 py-6 focus:outline-none sm:px-6 lg:px-10 xl:overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-5">
          <div>
            <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-accent">{engineMode ? "Engine game" : "Private room"}</p>
            <h1 className="mt-1 text-2xl font-bold text-fg">{engineMode ? "Play the engine" : "Create a room"}</h1>
            <p className="mt-1 text-[14px] text-fg-muted">
              {engineMode
                ? "Choose a time control and your side. The engine's moves are chosen by the engine service and checked by the server; both clocks are official."
                : "Choose the settings, then invite a registered player. Only invited players can join."}
            </p>
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
                    legend={engineMode ? "You play" : undefined}
                  />
                  {engineMode ? null : (
                    <p className="text-[12px] text-fg-subtle">
                      Rooms stay open for {options.data.roomTtlMinutes} minutes; invitations expire after {options.data.invitationTtlMinutes}.
                    </p>
                  )}
                </div>
              )}
            </Panel>

            {engineMode ? (
              <EngineOpponentPanel />
            ) : (
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
            )}

            {submitError ? (
              <p role="alert" className="rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-[14px] text-danger">
                {submitError.message}
                {resumeGameId ? (
                  <>
                    {" "}
                    <Link href={routes.game(resumeGameId)} className="font-semibold underline">
                      Resume that game
                    </Link>
                  </>
                ) : null}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => router.push(routes.play)} disabled={busy}>
                Cancel
              </Button>
              {engineMode ? (
                <EngineSubmitButton disabled={!preset || busy} pending={createEngineGame.isPending} />
              ) : (
                <Button type="submit" variant="primary" disabled={!preset || busy}>
                  {create.isPending ? "Creating…" : invite.isPending ? "Sending invitation…" : recipient.trim() ? "Create room and invite" : "Create room"}
                </Button>
              )}
            </div>
          </form>
        </div>
      </main>
    </>
  );
}

/** Who the player will face, as the server reports it. No strength or rating is claimed. */
function EngineOpponentPanel() {
  const status = useEngineStatusQuery();
  return (
    <Panel title="Opponent" icon={<RobotIcon />} busy={status.isFetching}>
      {status.isPending ? (
        <Skeleton className="h-12 w-full" />
      ) : status.isError ? (
        <ErrorState
          title="Couldn't check the engine"
          message={status.error.message}
          onRetry={() => status.refetch()}
          retrying={status.isRefetching}
        />
      ) : (
        <div className="flex flex-col gap-3">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-[16px] font-semibold text-fg">{status.data.engine ?? "Engine service"}</span>
            <span
              className={
                status.data.available
                  ? "rounded-[4px] border border-success-line bg-success-soft px-2 py-[1px] text-[12px] font-bold uppercase tracking-[0.06em] text-success"
                  : "rounded-[4px] border border-line-strong bg-surface-hover px-2 py-[1px] text-[12px] font-bold uppercase tracking-[0.06em] text-fg-muted"
              }
            >
              {status.data.available ? "Ready" : status.data.configured ? "Unavailable" : "Not set up"}
            </span>
          </p>
          {!status.data.available ? (
            <p className="text-[14px] text-fg-muted">
              {status.data.configured
                ? "The engine service isn't answering right now. Try again in a moment."
                : "Engine play isn't configured on this server."}
              {status.data.configured ? (
                <Button className="ml-2" variant="ghost" onClick={() => void status.refetch()} disabled={status.isFetching}>
                  Check again
                </Button>
              ) : null}
            </p>
          ) : null}
          <ul className="list-disc space-y-1 pl-5 text-[13px] text-fg-subtle">
            <li>The engine&apos;s thinking and network time run on its own clock.</li>
            <li>Draw offers aren&apos;t available against the engine.</li>
            <li>If the engine service fails and can&apos;t recover, the game is aborted without a result.</li>
          </ul>
        </div>
      )}
    </Panel>
  );
}

function EngineSubmitButton({ disabled, pending }: { disabled: boolean; pending: boolean }) {
  const status = useEngineStatusQuery();
  return (
    <Button type="submit" variant="primary" disabled={disabled || !status.data?.available}>
      {pending ? "Starting…" : "Start game"}
    </Button>
  );
}
