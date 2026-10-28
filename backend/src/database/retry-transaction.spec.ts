import { describe, expect, it, vi } from 'vitest';
import { retryTransaction } from './retry-transaction';
describe('bounded transaction retry', () => {
  it.each(['P2034', '40001', '40P01'])(
    'retries rolled-back conflict %s up to three attempts',
    async (code) => {
      const run = vi
        .fn()
        .mockRejectedValueOnce({ code })
        .mockRejectedValueOnce({ code })
        .mockResolvedValue('committed');
      expect(await retryTransaction(run)).toBe('committed');
      expect(run).toHaveBeenCalledTimes(3);
      const failing = vi.fn().mockRejectedValue({ code });
      await expect(retryTransaction(failing)).rejects.toMatchObject({ code });
      expect(failing).toHaveBeenCalledTimes(3);
    },
  );
  it('does not replay ambiguous commit/network errors', async () => {
    const run = vi
      .fn()
      .mockRejectedValue(new Error('connection lost after COMMIT'));
    await expect(retryTransaction(run)).rejects.toThrow('connection lost');
    expect(run).toHaveBeenCalledTimes(1);
  });
});
