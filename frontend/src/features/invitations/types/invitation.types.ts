import type { TimeControl } from "@/types/time-control.types";
import type { UserSummary } from "@/types/user-summary.types";

export type InvitationStatus = "pending" | "accepted" | "declined" | "cancelled" | "expired";
/** Whether the room can still be joined through this invitation. */
export type RoomAvailability = "open" | "full" | "closed" | "joined";

export type InvitationRoom = {
  id: string;
  status: "waiting" | "ready" | "started" | "cancelled" | "expired";
  timeControl: TimeControl;
  colorPreference: "white" | "black" | "random";
  host: UserSummary;
  seatOpen: boolean;
  expiresAt: string;
  availability: RoomAvailability;
};

/** Viewer-specific; never contains an email address. */
export type Invitation = {
  id: string;
  status: InvitationStatus;
  addressedBy: "username" | "email";
  createdAt: string;
  expiresAt: string;
  respondedAt: string | null;
  sender: UserSummary;
  recipient: UserSummary;
  room: InvitationRoom;
  viewer: {
    role: "sender" | "recipient";
    canAccept: boolean;
    canDecline: boolean;
    canCancel: boolean;
  };
};

export type InvitationResponse = { invitation: Invitation };
export type InvitationList = { items: Invitation[]; nextCursor?: string | null };
