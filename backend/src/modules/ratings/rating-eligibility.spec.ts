import { describe, expect, it } from 'vitest';
import { isRatingEligible } from './rating-eligibility';
const started = {
  rated: true,
  mode: 'RANDOM',
  status: 'FINISHED',
  result: 'WHITE_WINS',
  termination: 'RESIGNATION',
};
describe('rated result eligibility', () => {
  it.each([
    'CHECKMATE',
    'RESIGNATION',
    'TIMEOUT',
    'AGREEMENT',
    'STALEMATE',
    'INSUFFICIENT_MATERIAL',
    'TIMEOUT_VS_INSUFFICIENT_MATERIAL',
  ])('settles official %s regardless of move count', (termination) => {
    expect(isRatingEligible({ ...started, termination })).toBe(true);
  });
  it.each([
    { rated: false },
    { mode: 'FRIENDS' },
    { mode: 'ENGINE' },
    { status: 'ACTIVE', result: null },
    { result: 'ABORTED', termination: 'ENGINE_FAILURE' },
    { termination: null },
  ])('does not settle ineligible %s', (change) => {
    expect(isRatingEligible({ ...started, ...change })).toBe(false);
  });
});
