import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Environment } from '../../config/environment';
import { EmailOutboxService } from './email-outbox.service';
import { EmailWorkerService } from './email-worker.service';
import { MAIL_TRANSPORT } from './mail-transport';
import { SmtpMailTransport } from './smtp-mail.transport';

@Module({
  providers: [
    {
      provide: MAIL_TRANSPORT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Environment, true>) =>
        config.get('MAIL_TRANSPORT', { infer: true }) === 'smtp'
          ? new SmtpMailTransport({
              host: config.get('SMTP_HOST', { infer: true })!,
              port: config.get('SMTP_PORT', { infer: true }),
              secure: config.get('SMTP_SECURE', { infer: true }),
              requireTls: config.get('SMTP_REQUIRE_TLS', { infer: true }),
              user: config.get('SMTP_USER', { infer: true }),
              password: config.get('SMTP_PASSWORD', { infer: true }),
              from: config.get('MAIL_FROM', { infer: true })!,
            })
          : null,
    },
    EmailOutboxService,
    EmailWorkerService,
  ],
  exports: [EmailOutboxService, EmailWorkerService],
})
export class MailModule {}
