import { PresenceService } from '../realtime/presence.service';
import { toRoomView, type RoomWithSeats } from './room-view';
import { createRoomSchema, updateRoomSettingsSchema } from './rooms.schemas';
import { TIME_CONTROL_PRESETS, findPreset, timeControlOf } from './time-controls';

const now = new Date('2026-10-22T12:00:00Z');
const room = (overrides: Partial<RoomWithSeats> = {}): RoomWithSeats => ({
  id: 'room-1',
  hostId: 'host',
  challengerId: 'guest',
  status: 'WAITING',
  revision: 3,
  initialMs: 300_000,
  incrementMs: 0,
  colorPreference: 'WHITE',
  hostReady: true,
  challengerReady: false,
  expiresAt: new Date(now.getTime() + 60_000),
  closedAt: null,
  createdAt: now,
  updatedAt: now,
  host: { id: 'host', username: 'Host' },
  challenger: { id: 'guest', username: 'Guest' },
  game: null,
  ...overrides,
});

describe('Room settings', () => {
  it('accepts only supported presets and derives their category', () => {
    expect(TIME_CONTROL_PRESETS.every((p) => findPreset(p.initialMs, p.incrementMs) === p)).toBe(true);
    expect(createRoomSchema.parse({ timeControl: { initialMs: 180_000, incrementMs: 2_000 } })).toEqual({
      timeControl: { initialMs: 180_000, incrementMs: 2_000 },
      colorPreference: 'random',
    });
    expect(createRoomSchema.safeParse({ timeControl: { initialMs: 180_000, incrementMs: 1 } }).success).toBe(false);
    expect(timeControlOf({ initialMs: 1_800_000, incrementMs: 20_000 }).category).toBe('classical');
    expect(updateRoomSettingsSchema.safeParse({ expectedRevision: 1 }).success).toBe(false);
    expect(updateRoomSettingsSchema.safeParse({ colorPreference: 'black' }).success).toBe(false);
  });
});

describe('Room views', () => {
  it('assigns seat colours from the host preference and hides rooms from non-participants', () => {
    const view = toRoomView(room(), 'guest', (id) => id === 'host', now)!;
    expect(view.seats.host).toMatchObject({ color: 'white', online: true, ready: true });
    expect(view.seats.challenger).toMatchObject({ color: 'black', online: false });
    expect(view.viewer).toEqual({
      role: 'challenger',
      canEditSettings: false,
      canInvite: false,
      canCancel: false,
      canLeave: true,
      canSetReady: true,
      canStart: false,
    });
    expect(toRoomView(room(), 'stranger', () => false, now)).toBeNull();
    expect(toRoomView(room({ colorPreference: 'RANDOM' }), 'host', () => false, now)!.seats.host.color).toBeNull();
  });

  it('treats a passed expiry as expired with no permitted actions', () => {
    const view = toRoomView(room({ expiresAt: now }), 'host', () => false, now)!;
    expect(view.status).toBe('expired');
    expect(Object.entries(view.viewer).filter(([k, v]) => k !== 'role' && v)).toEqual([]);
  });
});

describe('Room start', () => {
  it('lets only the host start a ready room', () => {
    const ready = room({ status: 'READY', challengerReady: true });
    expect(toRoomView(ready, 'host', () => true, now)!.viewer.canStart).toBe(true);
    expect(toRoomView(ready, 'guest', () => true, now)!.viewer.canStart).toBe(false);
    expect(toRoomView(room(), 'host', () => true, now)!.viewer.canStart).toBe(false);
  });

  it('reports a started room with its game, even after the room TTL, and allows no further changes', () => {
    const started = room({
      status: 'STARTED',
      challengerReady: true,
      expiresAt: new Date(now.getTime() - 1),
      game: { id: 'game-1' },
    });
    const view = toRoomView(started, 'guest', () => true, now)!;
    expect(view).toMatchObject({ status: 'started', gameId: 'game-1' });
    expect(Object.entries(view.viewer).filter(([k, v]) => k !== 'role' && v)).toEqual([]);
  });
});

describe('Presence', () => {
  it('stays online until the last socket of an account disconnects', () => {
    const presence = new PresenceService();
    const changes: boolean[] = [];
    presence.changes$.subscribe((c) => changes.push(c.online));
    presence.connect('user', 'tab-1');
    presence.connect('user', 'tab-2');
    presence.disconnect('user', 'tab-1');
    expect(presence.isOnline('user')).toBe(true);
    presence.disconnect('user', 'tab-1');
    presence.disconnect('user', 'tab-2');
    expect(presence.isOnline('user')).toBe(false);
    expect(changes).toEqual([true, false]);
  });
});
