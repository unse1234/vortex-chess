import { engineSearchBudget } from './engine-budget';

const policy = { allowanceMs: 200, transportReserveMs: 1_500, commitReserveMs: 150, requestTimeoutMs: 10_000 };

describe('Engine search budget', () => {
  it('requests the full allowance while the clock allows, with the request capped', () => {
    expect(engineSearchBudget(600_000, policy)).toEqual({ searchMs: 200, timeoutMs: 10_000 });
  });

  it('shortens the search and bounds the request by the clock when time is short', () => {
    expect(engineSearchBudget(1_750, policy)).toEqual({ searchMs: 100, timeoutMs: 1_600 });
    expect(engineSearchBudget(1_660, policy)).toEqual({ searchMs: 10, timeoutMs: 1_510 });
  });

  it('never rounds a budget below the 10 ms minimum up past the clock', () => {
    expect(engineSearchBudget(1_659, policy)).toBeNull();
    expect(engineSearchBudget(0, policy)).toBeNull();
    expect(engineSearchBudget(-50, policy)).toBeNull();
  });

  it('never exceeds the documented 30 s movetime maximum', () => {
    expect(engineSearchBudget(3_600_000, { ...policy, allowanceMs: 60_000, requestTimeoutMs: 60_000 })?.searchMs).toBe(30_000);
  });
});
