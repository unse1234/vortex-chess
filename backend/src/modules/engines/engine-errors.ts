/**
 * Normalized engine-service failures. None of them is ever a statement about
 * a player's move: they describe the service, the transport or the contract.
 */
export type EngineErrorKind =
  /** 400: the service rejected our FEN. A bug on our side or in the contract. */
  | 'invalid_position'
  /** 422: the service rejected our request shape or limits. */
  | 'invalid_request'
  /** 409: the service is busy with another search. */
  | 'busy'
  /** 503/502, or the connection could not be made. */
  | 'unavailable'
  /** 504: the service's own analysis timeout fired. */
  | 'upstream_timeout'
  /** 200 with timed_out: true. Partial-result semantics are unconfirmed, so it counts as a failed search. */
  | 'search_timed_out'
  /** Our deadline passed before a response arrived; the request was aborted. */
  | 'deadline_exceeded'
  /** The connection broke after the request was sent; the search may have started. */
  | 'connection_lost'
  /** Our own concurrency queue is full. */
  | 'capacity_exhausted'
  /** The response did not match the documented contract (status, shape or move format). */
  | 'contract_violation'
  /** The caller cancelled. */
  | 'cancelled'
  /** The engine's official clock no longer leaves room for a search within the documented limits. */
  | 'no_time'
  /** Engine play is not configured on this server. */
  | 'not_configured';

/** Failures that may succeed if the same search is asked again shortly. */
const RETRYABLE: ReadonlySet<EngineErrorKind> = new Set(['busy', 'unavailable', 'connection_lost']);

/**
 * Failures after which the remote search may still be running. Its slot stays
 * reserved for a quarantine period instead of being reused at once.
 */
const MAY_STILL_RUN: ReadonlySet<EngineErrorKind> = new Set([
  'deadline_exceeded',
  'connection_lost',
  'cancelled',
]);

export class EngineError extends Error {
  readonly retryable: boolean;
  readonly mayStillRun: boolean;

  constructor(
    readonly kind: EngineErrorKind,
    message: string,
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = 'EngineError';
    this.retryable = RETRYABLE.has(kind);
    this.mayStillRun = MAY_STILL_RUN.has(kind);
  }
}

export const isEngineError = (error: unknown): error is EngineError =>
  error instanceof EngineError;
