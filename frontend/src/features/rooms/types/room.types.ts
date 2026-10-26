import type { TimeControl } from "@/types/time-control.types";
import type { UserSummary } from "@/types/user-summary.types";

export type ColorPreference = "white" | "black" | "random";
export type RoomStatus = "waiting" | "ready" | "started" | "cancelled" | "expired";

export type RoomSeat = {
  player: UserSummary;
  ready: boolean;
  /** At least one authenticated connection, across tabs and devices. */
  online: boolean;
  /** Assigned colour, or null while the host's preference is random. */
  color: "white" | "black" | null;
};

/** Actions the backend permits this viewer; it enforces them again on every request. */
export type RoomViewerPermissions = {
  role: "host" | "challenger";
  canEditSettings: boolean;
  canInvite: boolean;
  canCancel: boolean;
  canLeave: boolean;
  canSetReady: boolean;
  /** Host only, once both players are ready. */
  canStart: boolean;
};

export type RoomSnapshot = {
  id: string;
  /** Increases with every persisted change; used to ignore stale payloads. */
  revision: number;
  status: RoomStatus;
  settings: { timeControl: TimeControl; colorPreference: ColorPreference };
  seats: { host: RoomSeat; challenger: RoomSeat | null };
  expiresAt: string;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** The game created when the room started; reloading the room recovers it. */
  gameId: string | null;
  viewer: RoomViewerPermissions;
};

export type TimeControlPreset = TimeControl & { id: string };

export type RoomOptions = {
  timeControls: TimeControlPreset[];
  defaultTimeControlId: string;
  colorPreferences: ColorPreference[];
  roomTtlMinutes: number;
  invitationTtlMinutes: number;
};

export type RoomResponse = { room: RoomSnapshot };

export type CreateRoomRequest = {
  timeControl: Pick<TimeControl, "initialMs" | "incrementMs">;
  colorPreference: ColorPreference;
};

export type RoomSettingsChange = Partial<CreateRoomRequest>;
