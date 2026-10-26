import { createInvitationSchema } from './invitations.schemas';
import { renderInvitationEmail } from './invitation-email.template';
import {
  effectiveInvitationStatus,
  toInvitationView,
  type InvitationWithRelations,
} from './invitation-view';

const now = new Date('2026-10-22T12:00:00Z');
function invitation(
  overrides: Partial<InvitationWithRelations> = {},
): InvitationWithRelations {
  const room = {
    id: 'room-1',
    hostId: 'host',
    challengerId: null,
    status: 'WAITING',
    revision: 1,
    initialMs: 180_000,
    incrementMs: 2_000,
    colorPreference: 'RANDOM',
    hostReady: false,
    challengerReady: false,
    expiresAt: new Date(now.getTime() + 3_600_000),
    closedAt: null,
    createdAt: now,
    updatedAt: now,
    host: { id: 'host', username: 'Host' },
    challenger: null,
  } as InvitationWithRelations['room'];
  return {
    id: 'inv-1',
    roomId: room.id,
    senderId: 'host',
    recipientId: 'guest',
    addressedBy: 'EMAIL',
    status: 'PENDING',
    expiresAt: new Date(now.getTime() + 60_000),
    respondedAt: null,
    createdAt: now,
    updatedAt: now,
    sender: { id: 'host', username: 'Host' },
    recipient: { id: 'guest', username: 'Guest' },
    room,
    ...overrides,
  };
}

describe('Invitation recipient parsing', () => {
  it('normalizes emails and username keys, and rejects other input', () => {
    expect(createInvitationSchema.parse({ recipient: ' Guest@Example.COM ' })).toEqual({
      recipient: { kind: 'EMAIL', email: 'guest@example.com' },
    });
    expect(createInvitationSchema.parse({ recipient: 'Chess_Fan' })).toEqual({
      recipient: { kind: 'USERNAME', usernameKey: 'chess_fan' },
    });
    for (const recipient of ['', 'ab', 'bad name', 'a@', 'x'.repeat(255)])
      expect(createInvitationSchema.safeParse({ recipient }).success).toBe(false);
    expect(
      createInvitationSchema.safeParse({ recipient: 'Chess_Fan', recipientId: 'x' }).success,
    ).toBe(false);
  });
});

describe('Invitation views', () => {
  it('reports expiry before it is persisted', () => {
    expect(effectiveInvitationStatus(invitation(), now)).toBe('pending');
    expect(
      effectiveInvitationStatus(invitation({ expiresAt: new Date(now.getTime() - 1) }), now),
    ).toBe('expired');
    expect(
      effectiveInvitationStatus(
        invitation({ status: 'ACCEPTED', expiresAt: new Date(0) }),
        now,
      ),
    ).toBe('accepted');
  });

  it('is visible only to its sender and recipient, with role-specific actions', () => {
    expect(toInvitationView(invitation(), 'stranger', now)).toBeNull();
    expect(toInvitationView(invitation(), 'guest', now)!.viewer).toEqual({
      role: 'recipient',
      canAccept: true,
      canDecline: true,
      canCancel: false,
    });
    expect(toInvitationView(invitation(), 'host', now)!.viewer).toEqual({
      role: 'sender',
      canAccept: false,
      canDecline: false,
      canCancel: true,
    });
  });

  it('distinguishes full, joined and closed rooms', () => {
    const full = invitation();
    full.room = { ...full.room, challengerId: 'someone' };
    expect(toInvitationView(full, 'guest', now)!.room.availability).toBe('full');
    expect(toInvitationView(full, 'guest', now)!.viewer.canAccept).toBe(false);
    const joined = invitation({ status: 'ACCEPTED' });
    joined.room = { ...joined.room, challengerId: 'guest' };
    expect(toInvitationView(joined, 'guest', now)!.room.availability).toBe('joined');
    const closed = invitation();
    closed.room = { ...closed.room, status: 'CANCELLED' };
    expect(toInvitationView(closed, 'guest', now)!.room.availability).toBe('closed');
  });
});

describe('Invitation email', () => {
  it('escapes user-controlled text in HTML and includes the invitation link', () => {
    const message = renderInvitationEmail({
      to: 'guest@example.com',
      senderUsername: '<b>Host</b>',
      timeControl: { category: 'blitz', initialMs: 180_000, incrementMs: 2_000 },
      colorPreference: 'random',
      expiresAt: now,
      link: 'https://play.example.com/rooms/join/inv-1?a=1&b=2',
    });
    expect(message.subject).toContain('<b>Host</b>');
    expect(message.html).not.toContain('<b>Host</b>');
    expect(message.html).toContain('&lt;b&gt;Host&lt;/b&gt;');
    expect(message.html).toContain('href="https://play.example.com/rooms/join/inv-1?a=1&amp;b=2"');
    expect(message.text).toContain('Blitz 3+2');
    expect(message.text).toContain('https://play.example.com/rooms/join/inv-1');
  });
});
