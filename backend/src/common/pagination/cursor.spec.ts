import { decodeCursor, encodeCursor } from './cursor';

it('rejects malformed UUID cursors before they can reach PostgreSQL', () => {
  const createdAt = new Date('2026-10-29T00:00:00Z');
  const id = '00000000-0000-4000-8000-000000000001';
  expect(decodeCursor(encodeCursor({ createdAt, id }))).toEqual({ createdAt, id });
  for (const value of ['invalid', `${createdAt.toISOString()}|${'-'.repeat(36)}`, `not-a-date|${id}`]) {
    expect(() => decodeCursor(Buffer.from(value).toString('base64url'))).toThrow();
  }
});
