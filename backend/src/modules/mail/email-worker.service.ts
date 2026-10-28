import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Environment } from '../../config/environment';
import { EmailOutboxService, type ClaimedEmailJob } from './email-outbox.service';
import {
  MAIL_TRANSPORT,
  MailDeliveryError,
  type MailTransport,
} from './mail-transport';

const BATCH_SIZE = 10;

/** In-process outbox worker for the single-instance deployment. */
@Injectable()
export class EmailWorkerService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(EmailWorkerService.name);
  private timer?: NodeJS.Timeout;
  private running: Promise<number> | null = null;
  private stopped = false;

  constructor(
    private readonly outbox: EmailOutboxService,
    private readonly config: ConfigService<Environment, true>,
    @Inject(MAIL_TRANSPORT) private readonly transport: MailTransport | null,
  ) {}

  get enabled() {
    return this.transport !== null;
  }

  onApplicationBootstrap() {
    const seconds = this.config.get('MAIL_WORKER_INTERVAL_SECONDS', {
      infer: true,
    });
    if (!this.transport) {
      this.logger.log('Mail transport disabled; emails stay queued.');
      return;
    }
    if (seconds === 0) return;
    this.timer = setInterval(() => void this.runOnce(), seconds * 1000);
    this.timer.unref();
  }

  onApplicationShutdown() {
    this.stopped = true;
    clearInterval(this.timer);
    this.transport?.close?.();
  }

  /** Schedules a prompt run after a commit enqueues work. */
  nudge() {
    if (this.timer && !this.stopped) setImmediate(() => void this.runOnce());
  }

  /** Processes due jobs until none remain; overlapping calls share one run. */
  runOnce(): Promise<number> {
    if (!this.transport) return Promise.resolve(0);
    this.running ??= this.drain().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async drain() {
    let processed = 0;
    try {
      for (;;) {
        if (this.stopped) break;
        const jobs = await this.outbox.claim(BATCH_SIZE);
        for (const job of jobs) await this.process(job);
        processed += jobs.length;
        if (jobs.length < BATCH_SIZE) break;
      }
    } catch (error) {
      this.logger.warn(
        `Mail worker run failed: ${error instanceof Error ? error.name : 'UnknownError'}`,
      );
    }
    return processed;
  }

  private async process(job: ClaimedEmailJob) {
    const handler = this.outbox.handlerFor(job.kind);
    if (!handler) {
      await this.outbox.markFailure(job, `No handler for ${job.kind}`, true);
      return;
    }
    let decision;
    try {
      decision = await handler(job);
    } catch (error) {
      await this.outbox.markFailure(
        job,
        `Validity check failed: ${error instanceof Error ? error.name : 'UnknownError'}`,
        false,
      );
      return;
    }
    if (decision.action === 'skip') {
      await this.outbox.markSkipped(job, decision.reason);
      return;
    }
    let final = true;
    try {
      const receipt = await this.transport!.send(decision.message);
      await this.outbox.markSent(job, receipt);
    } catch (error) {
      const permanent = error instanceof MailDeliveryError && error.permanent;
      final = permanent || job.attempts >= job.maxAttempts;
      // Transport errors carry status codes only, never message content.
      const reason =
        error instanceof MailDeliveryError
          ? error.message
          : error instanceof Error
            ? error.name
            : 'Unknown mail error';
      await this.outbox.markFailure(job, reason, permanent);
      if (final)
        this.logger.warn(
          `Email job ${job.id} (${job.kind}) failed after ${job.attempts} attempt(s): ${reason}`,
        );
    }
    if (final && decision.settle)
      await decision.settle().catch((error: unknown) =>
        this.logger.warn(
          `Email job ${job.id} cleanup failed: ${error instanceof Error ? error.name : 'UnknownError'}`,
        ),
      );
  }
}
