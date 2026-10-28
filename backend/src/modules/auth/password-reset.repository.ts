import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import type { Prisma } from '../../generated/prisma/client';

const HOUR_MS = 3_600_000;
/** Ended tokens are kept this long for the hourly limit and support, then deleted. */
const RETENTION_MS = 7 * 24 * HOUR_MS;

export type IssueLimits = { cooldownMs: number; maxPerHour: number };

/** Persistence for reset tokens. Every state change is a conditional write. */
@Injectable()
export class PasswordResetRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Replaces the account's outstanding tokens with a new one, unless the
   * account is inside its cooldown or hourly limit. The user row lock
   * serializes concurrent requests for one account.
   */
  async issueInTx(
    tx: Prisma.TransactionClient,
    input: {
      userId: string;
      tokenHash: string;
      mailPayload: string;
      expiresAt: Date;
      now: Date;
      limits: IssueLimits;
    },
  ) {
    const { userId, now, limits } = input;
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId}::uuid FOR UPDATE`;
    const recent = await tx.passwordResetToken.findMany({
      where: { userId, createdAt: { gt: new Date(now.getTime() - HOUR_MS) } },
      select: { createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    if (
      recent.length >= limits.maxPerHour ||
      (recent[0] &&
        recent[0].createdAt.getTime() > now.getTime() - limits.cooldownMs)
    )
      return null;
    await this.revokeOutstandingInTx(tx, userId, now);
    return tx.passwordResetToken.create({
      data: {
        userId,
        tokenHash: input.tokenHash,
        mailPayload: input.mailPayload,
        expiresAt: input.expiresAt,
      },
      select: { id: true },
    });
  }

  /** Read-only check; never consumes the token. */
  findUsable(tokenHash: string, now: Date) {
    return this.prisma.passwordResetToken.findFirst({
      where: {
        tokenHash,
        consumedAt: null,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      select: { id: true, userId: true, expiresAt: true },
    });
  }

  /**
   * Consumes a usable token. The predicate is re-evaluated under the row lock,
   * so of two concurrent submissions exactly one gets a row back. The user row
   * is locked first, in the same order as issuance, so the two cannot deadlock.
   */
  async consumeInTx(
    tx: Prisma.TransactionClient,
    input: { userId: string; tokenHash: string; now: Date },
  ) {
    const { userId, tokenHash, now } = input;
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId}::uuid FOR UPDATE`;
    const rows = await tx.$queryRaw<{ id: string; userId: string }[]>`
      UPDATE "PasswordResetToken"
      SET "consumedAt" = ${now}, "mailPayload" = NULL
      WHERE "tokenHash" = ${tokenHash} AND "userId" = ${userId}::uuid
        AND "consumedAt" IS NULL AND "revokedAt" IS NULL
        AND "expiresAt" > ${now}
      RETURNING "id", "userId"`;
    return rows[0] ?? null;
  }

  revokeOutstandingInTx(
    tx: Prisma.TransactionClient,
    userId: string,
    now: Date,
  ) {
    return tx.passwordResetToken.updateMany({
      where: { userId, consumedAt: null, revokedAt: null },
      data: { revokedAt: now, mailPayload: null },
    });
  }

  updatePasswordInTx(
    tx: Prisma.TransactionClient,
    userId: string,
    passwordHash: string,
  ) {
    return tx.user.update({
      where: { id: userId },
      data: { passwordHash },
      select: { id: true },
    });
  }

  findForEmail(id: string) {
    return this.prisma.passwordResetToken.findUnique({
      where: { id },
      select: {
        mailPayload: true,
        expiresAt: true,
        consumedAt: true,
        revokedAt: true,
        user: { select: { email: true } },
      },
    });
  }

  clearMailPayload(id: string) {
    return this.prisma.passwordResetToken.updateMany({
      where: { id, mailPayload: { not: null } },
      data: { mailPayload: null },
    });
  }

  /** Drops sealed link data of expired tokens and deletes long-ended rows. */
  async sweep(now: Date) {
    await this.prisma.passwordResetToken.updateMany({
      where: { expiresAt: { lte: now }, mailPayload: { not: null } },
      data: { mailPayload: null },
    });
    await this.prisma.passwordResetToken.deleteMany({
      where: { expiresAt: { lt: new Date(now.getTime() - RETENTION_MS) } },
    });
  }
}
