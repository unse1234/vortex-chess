import { EngineError } from './engine-errors';

export type SearchPermit = {
  /**
   * Frees the slot. `holdMs` keeps it reserved a while longer: after an
   * aborted request the remote search may still occupy the service.
   */
  release(holdMs?: number): void;
};

type Waiter = {
  grant: (permit: SearchPermit) => void;
  fail: (error: EngineError) => void;
};

/**
 * Bounded concurrency in front of the engine service, shared by every engine
 * game: at most `concurrency` searches in flight and `queue` waiting, in
 * arrival order. A waiter gives up when its deadline passes or its caller
 * cancels, so queueing never outlives the engine's clock.
 */
export class SearchGate {
  private active = 0;
  private readonly waiting: Waiter[] = [];

  constructor(private readonly limits: { concurrency: number; queue: number }) {}

  get stats() {
    return { active: this.active, queued: this.waiting.length };
  }

  acquire(options: { timeoutMs: number; signal?: AbortSignal }): Promise<SearchPermit> {
    if (options.signal?.aborted)
      return Promise.reject(new EngineError('cancelled', 'Cancelled before a search slot was free'));
    if (this.active < this.limits.concurrency && this.waiting.length === 0) {
      this.active += 1;
      return Promise.resolve(this.permit());
    }
    if (this.waiting.length >= this.limits.queue)
      return Promise.reject(new EngineError('capacity_exhausted', 'The engine search queue is full'));
    return new Promise<SearchPermit>((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        options.signal?.removeEventListener('abort', onAbort);
        const index = this.waiting.indexOf(waiter);
        if (index >= 0) this.waiting.splice(index, 1);
      };
      const waiter: Waiter = {
        grant: (permit) => {
          cleanup();
          resolve(permit);
        },
        fail: (error) => {
          cleanup();
          reject(error);
        },
      };
      const timer = setTimeout(
        () => waiter.fail(new EngineError('capacity_exhausted', 'No search slot before the deadline')),
        Math.max(1, options.timeoutMs),
      );
      const onAbort = () => waiter.fail(new EngineError('cancelled', 'Cancelled while waiting for a search slot'));
      options.signal?.addEventListener('abort', onAbort, { once: true });
      this.waiting.push(waiter);
    });
  }

  private permit(): SearchPermit {
    let released = false;
    return {
      release: (holdMs = 0) => {
        if (released) return;
        released = true;
        if (holdMs <= 0) return this.free();
        setTimeout(() => this.free(), holdMs).unref();
      },
    };
  }

  /** Hands the slot straight to the next waiter, or returns it. */
  private free() {
    const next = this.waiting[0];
    if (next) next.grant(this.permit());
    else this.active -= 1;
  }
}
