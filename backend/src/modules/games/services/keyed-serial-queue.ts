/**
 * Runs tasks one at a time per key, in arrival order. Every command that can
 * change a game (moves, draw actions, resignation, timeout checks) goes
 * through one game's lane, so two of them can never decide the same state.
 */
export class KeyedSerialQueue {
  private readonly tails = new Map<string, Promise<unknown>>();

  run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    const result = previous.then(task, task);
    const tail = result.catch(() => undefined);
    this.tails.set(key, tail);
    void tail.then(() => {
      if (this.tails.get(key) === tail) this.tails.delete(key);
    });
    return result;
  }

  /** Number of keys with queued or running work. */
  get size() {
    return this.tails.size;
  }
}
