import { canonicalPair } from './interaction-policy';
import { searchUsersSchema, socialPageSchema } from './social.schemas';

describe('Social contracts', () => {
  it('uses the same pair identity in either direction', () => {
    expect(canonicalPair('a', 'b')).toEqual(canonicalPair('b', 'a'));
    expect(canonicalPair('b', 'a')).toEqual({ pairLow: 'a', pairHigh: 'b' });
  });
  it('rejects unbounded pages, private-owner filters and email-like discovery', () => {
    expect(socialPageSchema.safeParse({ limit: 51 }).success).toBe(false);
    expect(
      socialPageSchema.safeParse({ userId: 'another-account' }).success,
    ).toBe(false);
    for (const search of [
      'a',
      'alice@example.com',
      'a'.repeat(21),
      '%_',
      'two words',
    ])
      expect(searchUsersSchema.safeParse({ search }).success).toBe(false);
    expect(
      searchUsersSchema.parse({ search: ' Alice_2 ', limit: '10' }),
    ).toMatchObject({ search: 'Alice_2', limit: 10 });
  });
});
