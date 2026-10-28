import {
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Environment } from '../../config/environment';
import { PrismaService } from '../../database/prisma.service';
import { ApiException } from '../../common/errors/api-exception';
import {
  EmailOutboxService,
  type ClaimedEmailJob,
  type MailJobDecision,
} from '../mail/email-outbox.service';
import { EmailWorkerService } from '../mail/email-worker.service';
import { UsersService } from '../users/users.service';
import { AuthService, digestToken } from './auth.service';
import type { ResetPasswordInput } from './auth.schemas';
import { PasswordService } from './password.service';
import {
  renderPasswordChangedEmail,
  renderPasswordResetEmail,
} from './password-reset-email.template';
import {
  RESET_TOKEN_PATTERN,
  ResetTokenSealer,
  generateResetToken,
} from './password-reset-token';
import { PasswordResetRepository } from './password-reset.repository';

export const PASSWORD_RESET_EMAIL_KIND = 'password-reset';
export const PASSWORD_CHANGED_EMAIL_KIND = 'password-changed';

export const FORGOT_PASSWORD_RESPONSE = {
  message:
    "If an account exists for this email, you'll receive a password reset link.",
} as const;

const invalidLink = () =>
  new ApiException(
    400,
    'reset_link_invalid',
    'This reset link is invalid, expired or already used. Request a new one.',
  );

/** Password recovery use cases: request a link, check it, reset with it. */
@Injectable()
export class PasswordRecoveryService
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new Logger(PasswordRecoveryService.name);
  private readonly sealer: ResetTokenSealer;
  private readonly inFlight = new Set<Promise<void>>();
  private sweepTimer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly auth: AuthService,
    private readonly passwords: PasswordService,
    private readonly tokens: PasswordResetRepository,
    private readonly outbox: EmailOutboxService,
    private readonly worker: EmailWorkerService,
    private readonly config: ConfigService<Environment, true>,
  ) {
    this.sealer = new ResetTokenSealer(
      config.get('JWT_ACCESS_SECRET', { infer: true }),
    );
  }

  onModuleInit() {
    this.outbox.registerHandler(PASSWORD_RESET_EMAIL_KIND, (job) =>
      this.decideResetEmail(job),
    );
    this.outbox.registerHandler(PASSWORD_CHANGED_EMAIL_KIND, (job) =>
      this.decideChangedEmail(job),
    );
    const seconds = this.config.get('EXPIRY_SWEEP_INTERVAL_SECONDS', {
      infer: true,
    });
    if (seconds > 0) {
      this.sweepTimer = setInterval(() => {
        this.tokens.sweep(new Date()).catch((error: unknown) =>
          this.logger.warn(
            `Reset token sweep failed: ${error instanceof Error ? error.name : 'UnknownError'}`,
          ),
        );
      }, seconds * 1000);
      this.sweepTimer.unref();
    }
  }

  async onApplicationShutdown() {
    clearInterval(this.sweepTimer);
    await this.settled();
  }

  /**
   * Same response for known and unknown addresses. Both paths await the same
   * lookup; issuance and queueing run afterwards, off the response path.
   */
  async requestReset(email: string) {
    const user = await this.users.findByEmail(email);
    if (user) this.track(this.issue(user.id));
    return FORGOT_PASSWORD_RESPONSE;
  }

  /** Resolves when background issuance started by earlier requests is done. */
  async settled() {
    while (this.inFlight.size) await Promise.allSettled(this.inFlight);
  }

  /** Read-only: opening or checking a link never consumes it. */
  async tokenStatus(token: string) {
    const found = RESET_TOKEN_PATTERN.test(token)
      ? await this.tokens.findUsable(digestToken(token), new Date())
      : null;
    return found
      ? { valid: true as const, expiresAt: found.expiresAt.toISOString() }
      : { valid: false as const };
  }

  async resetPassword(input: ResetPasswordInput) {
    if (!RESET_TOKEN_PATTERN.test(input.token)) throw invalidLink();
    const tokenHash = digestToken(input.token);
    // Cheap check first so unusable links don't cost a password hash.
    const candidate = await this.tokens.findUsable(tokenHash, new Date());
    if (!candidate) throw invalidLink();
    const passwordHash = await this.passwords.hash(input.password);
    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      const consumed = await this.tokens.consumeInTx(tx, {
        userId: candidate.userId,
        tokenHash,
        now,
      });
      if (!consumed) return null;
      await this.tokens.updatePasswordInTx(tx, consumed.userId, passwordHash);
      await this.tokens.revokeOutstandingInTx(tx, consumed.userId, now);
      const sessionIds = await this.auth.revokeUserSessionsInTx(
        tx,
        consumed.userId,
        now,
      );
      await this.outbox.enqueueInTx(tx, {
        kind: PASSWORD_CHANGED_EMAIL_KIND,
        dedupeKey: `password-changed:${consumed.id}`,
        recipientId: consumed.userId,
        passwordResetTokenId: consumed.id,
      });
      return { sessionIds };
    });
    if (!result) throw invalidLink();
    this.auth.announceRevoked(result.sessionIds);
    this.worker.nudge();
    return {
      message: 'Your password has been reset. Sign in with your new password.',
    };
  }

  private track(work: Promise<void>) {
    const tracked = work.finally(() => this.inFlight.delete(tracked));
    this.inFlight.add(tracked);
  }

  private async issue(userId: string) {
    try {
      const token = generateResetToken();
      const now = new Date();
      const ttlMinutes = this.config.get('PASSWORD_RESET_TTL_MINUTES', {
        infer: true,
      });
      const queued = await this.prisma.$transaction(async (tx) => {
        const created = await this.tokens.issueInTx(tx, {
          userId,
          tokenHash: digestToken(token),
          mailPayload: this.sealer.seal(token),
          expiresAt: new Date(now.getTime() + ttlMinutes * 60_000),
          now,
          limits: {
            cooldownMs:
              this.config.get('PASSWORD_RESET_COOLDOWN_SECONDS', {
                infer: true,
              }) * 1000,
            maxPerHour: this.config.get('PASSWORD_RESET_MAX_PER_HOUR', {
              infer: true,
            }),
          },
        });
        if (!created) return false;
        await this.outbox.enqueueInTx(tx, {
          kind: PASSWORD_RESET_EMAIL_KIND,
          dedupeKey: `password-reset:${created.id}`,
          recipientId: userId,
          passwordResetTokenId: created.id,
        });
        return true;
      });
      if (queued) this.worker.nudge();
    } catch (error) {
      this.logger.warn(
        `Password reset issuance failed: ${error instanceof Error ? error.name : 'UnknownError'}`,
      );
    }
  }

  private frontendUrl(path: string) {
    const base =
      this.config.get('APP_PUBLIC_URL', { infer: true }) ??
      this.config.get('CORS_ORIGINS', { infer: true })[0];
    return new URL(path, base.endsWith('/') ? base : `${base}/`);
  }

  /** Rebuilds the link just before sending; skips links that stopped being usable. */
  private async decideResetEmail(
    job: ClaimedEmailJob,
  ): Promise<MailJobDecision> {
    const id = job.passwordResetTokenId;
    const token = id ? await this.tokens.findForEmail(id) : null;
    if (!id || !token) return { action: 'skip', reason: 'token_missing' };
    const skip = async (reason: string) => {
      await this.tokens.clearMailPayload(id);
      return { action: 'skip', reason } as const;
    };
    if (token.consumedAt) return skip('token_consumed');
    if (token.revokedAt) return skip('token_replaced');
    if (token.expiresAt <= new Date()) return skip('token_expired');
    const raw = token.mailPayload ? this.sealer.open(token.mailPayload) : null;
    if (!raw) return skip('payload_unavailable');
    // The token travels in the fragment: browsers never send it to servers or in Referer.
    const link = this.frontendUrl('reset-password');
    link.hash = `token=${raw}`;
    return {
      action: 'send',
      message: renderPasswordResetEmail({
        to: token.user.email,
        link: link.toString(),
        expiresAt: token.expiresAt,
        ttlMinutes: this.config.get('PASSWORD_RESET_TTL_MINUTES', {
          infer: true,
        }),
      }),
      settle: async () => {
        await this.tokens.clearMailPayload(id);
      },
    };
  }

  private async decideChangedEmail(
    job: ClaimedEmailJob,
  ): Promise<MailJobDecision> {
    const id = job.passwordResetTokenId;
    const token = id ? await this.tokens.findForEmail(id) : null;
    if (!token?.consumedAt) return { action: 'skip', reason: 'token_missing' };
    return {
      action: 'send',
      message: renderPasswordChangedEmail({
        to: token.user.email,
        changedAt: token.consumedAt,
        signInLink: this.frontendUrl('sign-in').toString(),
      }),
    };
  }
}
