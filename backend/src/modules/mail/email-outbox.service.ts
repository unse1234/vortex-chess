import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { Environment } from '../../config/environment';
import { PrismaService } from '../../database/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import type { MailMessage, MailReceipt } from './mail-transport';

export type ClaimedEmailJob = {
  id: string;
  kind: string;
  dedupeKey: string;
  recipientId: string;
  invitationId: string | null;
  passwordResetTokenId: string | null;
  attempts: number;
  maxAttempts: number;
  lockToken: string;
};
export type MailJobDecision =
  | {
      action: 'send';
      message: MailMessage;
      /** Runs once the job is final (sent or failed for good), e.g. to discard sealed link data. */
      settle?: () => Promise<void>;
    }
  | { action: 'skip'; reason: string };
/** Rechecks domain validity immediately before sending. */
export type MailJobHandler = (job: ClaimedEmailJob) => Promise<MailJobDecision>;

const MAX_BACKOFF_MS = 3_600_000;

/** Durable outbox; jobs are written in the caller's domain transaction. */
@Injectable()
export class EmailOutboxService {
  private readonly handlers = new Map<string, MailJobHandler>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Environment, true>,
  ) {}

  registerHandler(kind: string, handler: MailJobHandler) {
    this.handlers.set(kind, handler);
  }
  handlerFor(kind: string) {
    return this.handlers.get(kind);
  }

  /** Idempotent: the dedupe key makes repeated enqueues a no-op. */
  async enqueueInTx(
    tx: Prisma.TransactionClient,
    job: {
      kind: string;
      dedupeKey: string;
      recipientId: string;
      invitationId?: string;
      passwordResetTokenId?: string;
    },
  ) {
    const created = await tx.emailJob.createManyAndReturn({
      data: [
        {
          ...job,
          maxAttempts: this.config.get('MAIL_MAX_ATTEMPTS', { infer: true }),
        },
      ],
      skipDuplicates: true,
      select: { id: true },
    });
    return created[0]?.id ?? null;
  }

  /**
   * Claims due jobs. SKIP LOCKED lets concurrent workers take disjoint jobs;
   * a crashed worker's lease expires and the job becomes claimable again.
   */
  async claim(batchSize: number): Promise<ClaimedEmailJob[]> {
    const lease = this.config.get('MAIL_LEASE_SECONDS', { infer: true });
    const token = randomUUID();
    // Abandoned jobs that already used every attempt cannot be retried.
    await this.prisma.$executeRaw`
      UPDATE "EmailJob"
      SET "status" = 'FAILED', "lockToken" = NULL, "lockedAt" = NULL,
          "lastError" = 'Worker lease expired after the final attempt',
          "completedAt" = now(), "updatedAt" = now()
      WHERE "status" = 'PROCESSING' AND "attempts" >= "maxAttempts"
        AND "lockedAt" <= now() - (${lease}::int * interval '1 second')`;
    const rows = await this.prisma.$queryRaw<Omit<ClaimedEmailJob, 'lockToken'>[]>`
      UPDATE "EmailJob"
      SET "status" = 'PROCESSING', "lockToken" = ${token}::uuid, "lockedAt" = now(),
          "attempts" = "attempts" + 1, "updatedAt" = now()
      WHERE "id" IN (
        SELECT "id" FROM "EmailJob"
        WHERE "attempts" < "maxAttempts" AND (
          ("status" = 'PENDING' AND "availableAt" <= now())
          OR ("status" = 'PROCESSING' AND "lockedAt" <= now() - (${lease}::int * interval '1 second'))
        )
        ORDER BY "availableAt" ASC
        LIMIT ${batchSize}::int
        FOR UPDATE SKIP LOCKED
      )
      RETURNING "id", "kind", "dedupeKey", "recipientId", "invitationId", "passwordResetTokenId", "attempts", "maxAttempts"`;
    return rows.map((row) => ({ ...row, lockToken: token }));
  }

  /** Each completion requires the claim token, so a stale worker cannot overwrite a newer claim. */
  private finish(job: ClaimedEmailJob, data: Prisma.EmailJobUpdateManyMutationInput) {
    return this.prisma.emailJob.updateMany({
      where: { id: job.id, lockToken: job.lockToken, status: 'PROCESSING' },
      data: { ...data, lockToken: null, lockedAt: null },
    });
  }

  markSent(job: ClaimedEmailJob, receipt: MailReceipt) {
    return this.finish(job, {
      status: 'SENT',
      providerMessageId: receipt.messageId.slice(0, 250),
      providerResponse: receipt.response.slice(0, 500),
      lastError: null,
      completedAt: new Date(),
    });
  }

  markSkipped(job: ClaimedEmailJob, reason: string) {
    return this.finish(job, {
      status: 'SKIPPED',
      skipReason: reason.slice(0, 60),
      completedAt: new Date(),
    });
  }

  markFailure(job: ClaimedEmailJob, message: string, permanent: boolean) {
    const exhausted = permanent || job.attempts >= job.maxAttempts;
    if (exhausted)
      return this.finish(job, {
        status: 'FAILED',
        lastError: message.slice(0, 500),
        completedAt: new Date(),
      });
    const base =
      this.config.get('MAIL_RETRY_BASE_SECONDS', { infer: true }) * 1000;
    const delay = Math.min(base * 2 ** (job.attempts - 1), MAX_BACKOFF_MS);
    return this.finish(job, {
      status: 'PENDING',
      lastError: message.slice(0, 500),
      availableAt: new Date(Date.now() + delay * (1 + Math.random() * 0.2)),
    });
  }
}
