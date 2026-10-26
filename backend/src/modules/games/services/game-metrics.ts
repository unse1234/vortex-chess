import { Injectable } from '@nestjs/common';

/** Server-side timeline of one accepted move, in milliseconds. */
export type MoveTiming = {
  /** Receipt until the game's lane started the command. */
  queueMs: number;
  /** Authorization, clock and rules, until the candidate state was ready. */
  validateMs: number;
  /** The database statement, until it returned. */
  commitMs: number;
  /** Publishing the committed state and emitting to subscribers. */
  emitMs: number;
  /** Receipt until emitted. */
  totalMs: number;
};

const CAPACITY = 20_000;

function percentile(sorted: readonly number[], p: number) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

/**
 * Bounded in-memory record of accepted-move timings: receipt -> queueing ->
 * validation -> commit -> emit. Network and browser time are not included;
 * they are measured on the client.
 */
@Injectable()
export class GameMetrics {
  private samples: MoveTiming[] = [];
  private next = 0;

  record(timing: MoveTiming) {
    if (this.samples.length < CAPACITY) this.samples.push(timing);
    else this.samples[this.next] = timing;
    this.next = (this.next + 1) % CAPACITY;
  }

  reset() {
    this.samples = [];
    this.next = 0;
  }

  summary() {
    const stage = (key: keyof MoveTiming) => {
      const sorted = this.samples.map((s) => s[key]).sort((a, b) => a - b);
      const round = (n: number) => Math.round(n * 1000) / 1000;
      return {
        p50: round(percentile(sorted, 50)),
        p95: round(percentile(sorted, 95)),
        p99: round(percentile(sorted, 99)),
        max: round(sorted.at(-1) ?? 0),
      };
    };
    return {
      count: this.samples.length,
      queue: stage('queueMs'),
      validate: stage('validateMs'),
      commit: stage('commitMs'),
      emit: stage('emitMs'),
      total: stage('totalMs'),
    };
  }
}
