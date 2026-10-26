import { createTransport, type Transporter } from 'nodemailer';
import {
  MailDeliveryError,
  type MailMessage,
  type MailReceipt,
  type MailTransport,
} from './mail-transport';

export type SmtpOptions = {
  host: string;
  port: number;
  secure: boolean;
  requireTls: boolean;
  user?: string;
  password?: string;
  from: string;
};

const addressOf = (entry: unknown) =>
  (typeof entry === 'string'
    ? entry
    : typeof entry === 'object' && entry !== null && 'address' in entry
      ? String(entry.address)
      : ''
  ).toLowerCase();

/** SMTP submission through the configured provider. */
export class SmtpMailTransport implements MailTransport {
  readonly name = 'smtp';
  private readonly transporter: Transporter;

  constructor(private readonly options: SmtpOptions) {
    this.transporter = createTransport({
      host: options.host,
      port: options.port,
      secure: options.secure,
      requireTLS: !options.secure && options.requireTls,
      ignoreTLS: !options.secure && !options.requireTls,
      auth: options.user
        ? { user: options.user, pass: options.password }
        : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }

  async send(message: MailMessage): Promise<MailReceipt> {
    let info: {
      messageId: string;
      response?: string;
      accepted?: unknown[];
      rejected?: unknown[];
    };
    try {
      info = await this.transporter.sendMail({
        from: this.options.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
    } catch (error) {
      const code =
        typeof error === 'object' && error !== null && 'responseCode' in error
          ? Number(error.responseCode)
          : undefined;
      // 5xx replies are permanent; connection problems and 4xx are retried.
      throw new MailDeliveryError(
        code ? `SMTP ${code}` : error instanceof Error ? error.name : 'SMTP error',
        code !== undefined && code >= 500 && code < 600,
      );
    }
    if (
      (info.rejected?.length ?? 0) > 0 ||
      !(info.accepted ?? []).map(addressOf).includes(message.to.toLowerCase())
    )
      throw new MailDeliveryError('Recipient rejected by provider', true);
    return {
      messageId: info.messageId,
      response: String(info.response ?? '').slice(0, 500),
    };
  }

  close() {
    this.transporter.close();
  }
}
