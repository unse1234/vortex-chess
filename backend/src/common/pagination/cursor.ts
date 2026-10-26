import { ApiException } from '../errors/api-exception';

/** Opaque keyset cursor over (createdAt DESC, id DESC). */
export type Keyset = { createdAt: Date; id: string };

export function encodeCursor(row: Keyset) {
  return Buffer.from(`${row.createdAt.toISOString()}|${row.id}`).toString(
    'base64url',
  );
}

export function decodeCursor(cursor: string | undefined): Keyset | undefined {
  if (!cursor) return undefined;
  const [iso, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
  const createdAt = new Date(iso ?? '');
  if (
    Number.isNaN(createdAt.getTime()) ||
    !/^[0-9a-f-]{36}$/.test(id ?? '')
  )
    throw new ApiException(400, 'invalid_cursor', 'The page cursor is invalid.');
  return { createdAt, id };
}

/** Prisma filter selecting rows strictly after the cursor in DESC order. */
export function afterCursor(cursor: Keyset | undefined) {
  return cursor
    ? {
        OR: [
          { createdAt: { lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { lt: cursor.id } },
        ],
      }
    : {};
}

export function page<T extends Keyset>(rows: T[], limit: number) {
  const items = rows.slice(0, limit);
  return {
    items,
    nextCursor:
      rows.length > limit ? encodeCursor(items[items.length - 1]) : null,
  };
}
