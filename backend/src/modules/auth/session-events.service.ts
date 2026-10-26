import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';
/** In-process notification that a session was revoked, so long-lived connections can close. */
@Injectable()
export class SessionEventsService {
  private readonly revokedSubject = new Subject<string>();
  readonly revoked$ = this.revokedSubject.asObservable();
  revoked(sessionId: string) {
    this.revokedSubject.next(sessionId);
  }
}
