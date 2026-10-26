import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';

export type PresenceChange = { userId: string; online: boolean };

/**
 * Online means at least one authenticated socket, across every tab and
 * device. Single-instance memory, matching the current deployment.
 */
@Injectable()
export class PresenceService {
  private readonly sockets = new Map<string, Set<string>>();
  private readonly changesSubject = new Subject<PresenceChange>();
  readonly changes$ = this.changesSubject.asObservable();

  connect(userId: string, socketId: string) {
    const sockets = this.sockets.get(userId) ?? new Set<string>();
    const wasOnline = sockets.size > 0;
    sockets.add(socketId);
    this.sockets.set(userId, sockets);
    if (!wasOnline) this.changesSubject.next({ userId, online: true });
  }

  disconnect(userId: string, socketId: string) {
    const sockets = this.sockets.get(userId);
    if (!sockets?.delete(socketId)) return;
    if (sockets.size > 0) return;
    this.sockets.delete(userId);
    this.changesSubject.next({ userId, online: false });
  }

  isOnline(userId: string) {
    return (this.sockets.get(userId)?.size ?? 0) > 0;
  }

  connectionCount(userId: string) {
    return this.sockets.get(userId)?.size ?? 0;
  }
}
