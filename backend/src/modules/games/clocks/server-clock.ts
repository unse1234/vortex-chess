import { Injectable } from '@nestjs/common';

/**
 * The game's single source of time. Wall-clock milliseconds, so values can be
 * persisted and compared after a restart, but never decreasing within the
 * process: a system clock step backwards cannot refund or double-charge time.
 */
@Injectable()
export class ServerClock {
  private last = 0;

  now() {
    const wall = Date.now();
    if (wall > this.last) this.last = wall;
    return this.last;
  }
}
