import { Injectable } from '@nestjs/common';
import type { EngineErrorKind } from './engine-errors';

/** One engine move request as seen from this server, in milliseconds. */
export type EngineSearchSample = {
  outcome: 'ok' | EngineErrorKind;
  attempts: number;
  /** Waiting for a search slot in our own gate. */
  queueMs: number;
  /** movetime we requested on the final attempt. */
  requestedMs: number;
  /** HTTP request sent until the response was parsed (final attempt). */
  roundTripMs: number | null;
  /** time_ms the engine reported. */
  engineTimeMs: number | null;
  /** True for a reply with a move but depth 0 and 0 nodes: no search was reported. */
  unsearched: boolean;
};

const CAPACITY = 5_000;

function percentile(sorted: readonly number[], p: number) {
  if (sorted.length === 0) return null;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return Math.round(sorted[Math.max(0, index)] * 10) / 10;
}

/**
 * Bounded record of engine requests. HTTP round trip, engine-reported search
 * time and queueing are kept apart: the round trip includes the network and
 * the service's own overhead, which the engine's time_ms does not.
 */
@Injectable()
export class EngineMetrics {
  private samples: EngineSearchSample[] = [];
  private next = 0;

  record(sample: EngineSearchSample) {
    if (this.samples.length < CAPACITY) this.samples.push(sample);
    else this.samples[this.next] = sample;
    this.next = (this.next + 1) % CAPACITY;
  }

  reset() {
    this.samples = [];
    this.next = 0;
  }

  summary() {
    const stage = (pick: (s: EngineSearchSample) => number | null) => {
      const sorted = this.samples
        .map(pick)
        .filter((v): v is number => v !== null)
        .sort((a, b) => a - b);
      return {
        count: sorted.length,
        p50: percentile(sorted, 50),
        p95: percentile(sorted, 95),
        max: sorted.at(-1) ?? null,
      };
    };
    const outcomes: Record<string, number> = {};
    for (const s of this.samples) outcomes[s.outcome] = (outcomes[s.outcome] ?? 0) + 1;
    return {
      requests: this.samples.length,
      outcomes,
      unsearched: this.samples.filter((s) => s.unsearched).length,
      roundTrip: stage((s) => s.roundTripMs),
      engineTime: stage((s) => s.engineTimeMs),
      queue: stage((s) => s.queueMs),
    };
  }
}
