import { describe, expect, it } from "vitest";
import {
  hasNotification,
  insertNotification,
  markRead,
  patchInvitation,
  type Inbox,
} from "@/features/notifications/realtime/reconcile-notifications";
import type { NotificationItem } from "@/features/notifications/types/notification.types";

function item(id: string, overrides: Partial<NotificationItem> = {}): NotificationItem {
  return {
    id,
    type: "invitation.received",
    createdAt: "2026-10-22T12:00:00Z",
    readAt: null,
    actor: { id: "host", username: "Host", avatarUrl: null },
    invitation: {
      id: `inv-${id}`,
      status: "pending",
      expiresAt: "2026-10-22T12:30:00Z",
      room: { id: "room-1", timeControl: { category: "blitz", initialMs: 180_000, incrementMs: 2_000 }, availability: "open" },
      viewer: { role: "recipient" },
    },
    roomId: "room-1",
    ...overrides,
  };
}
const inbox = (...pages: NotificationItem[][]): Inbox => ({
  pages: pages.map((items) => ({ items, nextCursor: null, unreadCount: 0 })),
  pageParams: pages.map(() => undefined),
});

describe("notification inbox reconciliation", () => {
  it("prepends a delivered entry once, recognising repeats by stable id on any page", () => {
    const start = inbox([item("b")], [item("a")]);
    const once = insertNotification(start, item("c"));
    expect(once.pages[0].items.map((n) => n.id)).toEqual(["c", "b"]);
    expect(insertNotification(once, item("c"))).toBe(once);
    expect(insertNotification(once, item("a"))).toBe(once);
    expect(hasNotification(once, "a")).toBe(true);
  });

  it("marks selected or all entries read", () => {
    const start = inbox([item("a"), item("b")]);
    const one = markRead(start, ["a"], "2026-10-22T12:05:00Z");
    expect(one.pages[0].items.map((n) => n.readAt !== null)).toEqual([true, false]);
    const all = markRead(one, "all", "2026-10-22T12:06:00Z");
    expect(all.pages[0].items.every((n) => n.readAt !== null)).toBe(true);
    expect(markRead(all, "all", "later")).toBe(all);
  });

  it("shows the current invitation state without reverting answered invitations", () => {
    const start = inbox([item("a")]);
    const cancelled = patchInvitation(start, { ...item("a").invitation!, status: "cancelled", viewer: { role: "sender" } });
    expect(cancelled.pages[0].items[0].invitation).toMatchObject({ status: "cancelled", viewer: { role: "recipient" } });
    expect(patchInvitation(cancelled, item("a").invitation!)).toBe(cancelled);
  });
});
