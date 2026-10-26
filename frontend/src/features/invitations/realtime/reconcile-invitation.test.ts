import { describe, expect, it } from "vitest";
import {
  reconcileInvitation,
  reconcileInvitationList,
} from "@/features/invitations/realtime/reconcile-invitation";
import { inviteRecipientSchema } from "@/features/invitations/schemas/invite-recipient.schema";
import type { Invitation } from "@/features/invitations/types/invitation.types";

function invitation(id: string, overrides: Partial<Invitation> = {}): Invitation {
  return {
    id,
    status: "pending",
    addressedBy: "username",
    createdAt: `2026-10-22T12:0${id.length}:00Z`,
    expiresAt: "2026-10-22T12:30:00Z",
    respondedAt: null,
    sender: { id: "host", username: "Host", avatarUrl: null },
    recipient: { id: "guest", username: "Guest", avatarUrl: null },
    room: {
      id: "room-1",
      status: "waiting",
      timeControl: { category: "blitz", initialMs: 180_000, incrementMs: 2_000 },
      colorPreference: "random",
      host: { id: "host", username: "Host", avatarUrl: null },
      seatOpen: true,
      expiresAt: "2026-10-22T14:00:00Z",
      availability: "open",
    },
    viewer: { role: "sender", canAccept: false, canDecline: false, canCancel: true },
    ...overrides,
  };
}

describe("invitation reconciliation", () => {
  it("never lets a late pending response replace an answered invitation", () => {
    const accepted = invitation("a", { status: "accepted" });
    expect(reconcileInvitation(accepted, invitation("a"))).toBe(accepted);
    const full = invitation("a", { room: { ...invitation("a").room, availability: "full", seatOpen: false } });
    expect(reconcileInvitation(invitation("a"), full)).toBe(full);
  });

  it("upserts into a newest-first list", () => {
    const list = [invitation("a")];
    const added = reconcileInvitationList(list, invitation("bb"));
    expect(added.map((i) => i.id)).toEqual(["bb", "a"]);
    const cancelled = reconcileInvitationList(added, invitation("a", { status: "cancelled" }));
    expect(cancelled.find((i) => i.id === "a")?.status).toBe("cancelled");
    expect(reconcileInvitationList(cancelled, invitation("a"))).toBe(cancelled);
  });
});

describe("invite recipient field", () => {
  it("accepts usernames and emails and rejects other input", () => {
    for (const value of ["Chess_Fan", " friend@example.com "]) expect(inviteRecipientSchema.safeParse(value).success).toBe(true);
    for (const value of ["", "ab", "two words", "friend@", "@example.com"]) expect(inviteRecipientSchema.safeParse(value).success).toBe(false);
  });
});
