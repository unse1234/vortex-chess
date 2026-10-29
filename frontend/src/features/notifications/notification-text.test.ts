import { expect, it } from "vitest";
import { describeNotification } from "./notification-text";
import { shouldSoundNotification } from "./notification-audio";
import type { NotificationItem } from "./types/notification.types";

it("makes old friend requests non-actionable and never replays historical audio", () => {
  const now = Date.now();
  const item: NotificationItem = {
    id: "notification",
    type: "friend.request.received",
    readAt: null,
    createdAt: new Date(now).toISOString(),
    actor: null,
    invitation: null,
    roomId: null,
    friendRequest: { id: "request", state: "PENDING" },
  };
  expect(describeNotification(item).href).toBe("/friends");
  expect(shouldSoundNotification(item, now - 1, now)).toBe(true);
  expect(shouldSoundNotification(item, now + 1, now)).toBe(false);
  for (const state of ["CANCELLED", "ACCEPTED", "DECLINED"] as const) {
    const completed = { ...item, friendRequest: { id: "request", state } };
    expect(describeNotification(completed).href).toBeNull();
    expect(shouldSoundNotification(completed, now - 1, now)).toBe(false);
  }
});
