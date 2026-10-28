import { expect, it } from "vitest";
import { shouldSoundNotification } from "./notification-audio";
import type { NotificationItem } from "./types/notification.types";

const now = Date.parse("2026-10-28T10:00:00Z");
const item: NotificationItem = {
  id: "n", type: "invitation.received", createdAt: new Date(now).toISOString(), readAt: null, actor: null, roomId: "r",
  invitation: { id: "i", status: "pending", expiresAt: new Date(now + 60000).toISOString(), room: { id: "r", availability: "open", timeControl: { category: "blitz", initialMs: 180000, incrementMs: 0 } }, viewer: { role: "recipient" } },
};
it("allows only fresh, unread realtime notifications after the subscription boundary", () => {
  expect(shouldSoundNotification(item, now - 100, now)).toBe(true);
  expect(shouldSoundNotification(item, now + 1, now)).toBe(false);
  expect(shouldSoundNotification(item, now - 100, now + 6000)).toBe(false);
  expect(shouldSoundNotification({ ...item, readAt: item.createdAt }, now - 100, now)).toBe(false);
  expect(shouldSoundNotification({ ...item, invitation: { ...item.invitation!, status: "cancelled" } }, now - 100, now)).toBe(false);
  expect(shouldSoundNotification({ ...item, invitation: { ...item.invitation!, expiresAt: item.createdAt } }, now - 100, now)).toBe(false);
});
