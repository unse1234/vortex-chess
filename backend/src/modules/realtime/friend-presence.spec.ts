import { ConfigService } from '@nestjs/config';
import type { Environment } from '../../config/environment';
import { PresenceService } from './presence.service';

it('uses a configurable grace and reconnects without false offline/online transitions', () => {
  vi.useFakeTimers();
  const config = new ConfigService({
    PRESENCE_DISCONNECT_GRACE_MS: 100,
  }) as ConfigService<Environment, true>;
  const presence = new PresenceService(config);
  const changes: boolean[] = [];
  presence.changes$.subscribe((change) => changes.push(change.online));
  try {
    presence.connect('user', 'first');
    presence.disconnect('user', 'first');
    expect(presence.connectionCount('user')).toBe(0);
    expect(presence.isOnline('user')).toBe(true);
    vi.advanceTimersByTime(99);
    presence.connect('user', 'second');
    vi.advanceTimersByTime(101);
    expect(changes).toEqual([true]);
    presence.disconnect('user', 'second');
    vi.advanceTimersByTime(100);
    expect(changes).toEqual([true, false]);
    expect(presence.isOnline('user')).toBe(false);
  } finally {
    presence.onModuleDestroy();
    vi.useRealTimers();
  }
});
