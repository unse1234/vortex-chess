import type { ApiException } from './api-exception';

/**
 * Returned from a transaction callback when the request must fail but the
 * transaction's writes (for example, recording an expiry) should still
 * commit. Throwing inside the callback would roll them back.
 */
export class DeferredFailure {
  constructor(
    readonly error: ApiException,
    /** Records changed by the committed writes, to publish before failing. */
    readonly changedIds: string[] = [],
  ) {}
}

export function unwrap<T>(result: T | DeferredFailure): T {
  if (result instanceof DeferredFailure) throw result.error;
  return result;
}
