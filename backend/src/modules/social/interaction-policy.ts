import { ApiException } from '../../common/errors/api-exception';
import type { Prisma } from '../../generated/prisma/client';

export function canonicalPair(a: string, b: string) {
  a = a.toLowerCase();
  b = b.toLowerCase();
  return a < b ? { pairLow: a, pairHigh: b } : { pairLow: b, pairHigh: a };
}

/** Global order: game admission (when needed), sender rate lock (send only),
 * canonical pair, room, invitation/request, sorted User revision rows.
 * Callers pass their transaction. No network calls while locks are held. */
export async function lockInteractionPair(
  tx: Prisma.TransactionClient,
  a: string,
  b: string,
) {
  const pair = canonicalPair(a, b);
  const key = `vortix:social:${pair.pairLow}:${pair.pairHigh}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
  return pair;
}

export const interactionUnavailable = () =>
  new ApiException(
    409,
    'interaction_unavailable',
    'This interaction is unavailable.',
  );

export function blockFilter(a: string, b: string): Prisma.UserBlockWhereInput {
  return {
    OR: [
      { blockerId: a, blockedId: b },
      { blockerId: b, blockedId: a },
    ],
  };
}

export async function interactionAllowed(
  tx: Prisma.TransactionClient,
  a: string,
  b: string,
) {
  return !(await tx.userBlock.findFirst({
    where: blockFilter(a, b),
    select: { id: true },
  }));
}

export async function assertInteractionAllowed(
  tx: Prisma.TransactionClient,
  a: string,
  b: string,
) {
  if (!(await interactionAllowed(tx, a, b))) throw interactionUnavailable();
}

/** Used by lists and discovery; neither the record nor the direction is exposed. */
export function unblockedUserFilter(viewerId: string): Prisma.UserWhereInput {
  return {
    blocks: { none: { blockedId: viewerId } },
    blockedBy: { none: { blockerId: viewerId } },
  };
}
