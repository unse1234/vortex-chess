import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Environment } from '../../config/environment';
import { Subject } from 'rxjs';

export type PresenceChange = { userId: string; online: boolean };

/**
 * Online means at least one authenticated socket, across every tab and
 * device. Single-instance memory, matching the current deployment.
 */
@Injectable()
export class PresenceService implements OnModuleDestroy {
  private readonly sockets = new Map<string, Set<string>>();
  private readonly changesSubject = new Subject<PresenceChange>();
  readonly changes$ = this.changesSubject.asObservable();
  private readonly disconnects = new Map<string, NodeJS.Timeout>();
  constructor(private readonly config?: ConfigService<Environment, true>) {}

  onModuleDestroy() {
    for (const timer of this.disconnects.values()) clearTimeout(timer);
    this.disconnects.clear();
  }

  connect(userId: string, socketId: string) {
    const sockets = this.sockets.get(userId) ?? new Set<string>();
    const wasOnline = this.isOnline(userId);
    clearTimeout(this.disconnects.get(userId));
    this.disconnects.delete(userId);
    sockets.add(socketId);
    this.sockets.set(userId, sockets);
    if (!wasOnline) this.changesSubject.next({ userId, online: true });
  }

  disconnect(userId: string, socketId: string) {
    const sockets = this.sockets.get(userId);
    if (!sockets?.delete(socketId)) return;
    if (sockets.size > 0) return;
    this.sockets.delete(userId);
    const grace = this.config?.get('PRESENCE_DISCONNECT_GRACE_MS', { infer: true }) ?? 0;
    if (grace === 0) this.changesSubject.next({ userId, online: false });
    else {
      const timer = setTimeout(() => {
        this.disconnects.delete(userId);
        this.changesSubject.next({ userId, online: false });
      }, grace);
      timer.unref();
      this.disconnects.set(userId, timer);
    }
  }

  isOnline(userId: string) {
    return (this.sockets.get(userId)?.size ?? 0) > 0 || this.disconnects.has(userId);
  }

  connectionCount(userId: string) {
    return this.sockets.get(userId)?.size ?? 0;
  }
}
