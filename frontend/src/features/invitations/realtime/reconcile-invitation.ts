import type { Invitation } from "@/features/invitations/types/invitation.types";

/** Personal-channel event sent to the sender and recipient after each committed change. */
export type InvitationRealtimeEvent = { type: "invitation.updated"; payload: { invitation: Invitation } };

/**
 * Invitation states only move forward (pending, then one final state), so a
 * late pending response never replaces an answered invitation. Otherwise the
 * newest arrival wins, e.g. a pending invitation whose room became full.
 */
export function reconcileInvitation(current: Invitation | undefined, incoming: Invitation): Invitation {
  if (!current || current.id !== incoming.id) return incoming;
  if (current.status !== "pending" && incoming.status === "pending") return current;
  return incoming;
}

/** Replaces or prepends one invitation in a newest-first list. */
export function reconcileInvitationList(list: readonly Invitation[], incoming: Invitation): Invitation[] {
  const index = list.findIndex((item) => item.id === incoming.id);
  if (index === -1)
    return [...list, incoming].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const merged = reconcileInvitation(list[index], incoming);
  if (merged === list[index]) return list as Invitation[];
  return list.map((item, i) => (i === index ? merged : item));
}
