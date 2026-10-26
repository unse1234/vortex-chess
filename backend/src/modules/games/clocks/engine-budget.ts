import { LIMIT_RANGES } from '../../engines/engine.types';

export type EngineBudgetPolicy = {
  /** Search time requested when the clock allows it. */
  allowanceMs: number;
  /** Kept back for HTTP travel and the engine service's own queueing. */
  transportReserveMs: number;
  /** Kept back for validating, committing and publishing the move. */
  commitReserveMs: number;
  /** Upper bound for one request regardless of the clock. */
  requestTimeoutMs: number;
};

/**
 * What the engine's official clock allows for one search request. Queueing,
 * travel and thinking are all paid from the engine's own running clock, so
 * the requested movetime is the allowance shortened to what remains after
 * both reserves. A budget below the service's 10 ms minimum is never rounded
 * up past the clock: there is no search, and the clock decides.
 */
export function engineSearchBudget(remainingMs: number, policy: EngineBudgetPolicy) {
  const available = Math.floor(remainingMs - policy.transportReserveMs - policy.commitReserveMs);
  const searchMs = Math.min(policy.allowanceMs, available, LIMIT_RANGES.movetime.max);
  if (searchMs < LIMIT_RANGES.movetime.min) return null;
  const timeoutMs = Math.floor(Math.min(policy.requestTimeoutMs, remainingMs - policy.commitReserveMs));
  return { searchMs, timeoutMs };
}
