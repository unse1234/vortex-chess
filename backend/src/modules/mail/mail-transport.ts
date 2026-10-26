export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};
/** What the provider confirmed. Acceptance by the provider is not inbox delivery. */
export type MailReceipt = { messageId: string; response: string };

export interface MailTransport {
  readonly name: string;
  send(message: MailMessage): Promise<MailReceipt>;
  close?(): void;
}

/** DI token; resolves to null when MAIL_TRANSPORT=disabled. */
export const MAIL_TRANSPORT = 'MAIL_TRANSPORT';

export class MailDeliveryError extends Error {
  constructor(
    message: string,
    /** Permanent failures are not retried. */
    readonly permanent: boolean,
  ) {
    super(message);
    this.name = 'MailDeliveryError';
  }
}
