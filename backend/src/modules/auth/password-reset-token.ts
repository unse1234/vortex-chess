import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from 'node:crypto';

/** 32 random bytes, base64url without padding (256 bits of entropy). */
export const RESET_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export const generateResetToken = () => randomBytes(32).toString('base64url');

/**
 * Seals the raw token for the outbox worker, which must rebuild the emailed
 * link after the request transaction committed. AES-256-GCM with a key derived
 * from the server secret; the sealed value is discarded once the email settles.
 */
export class ResetTokenSealer {
  private readonly key: Buffer;

  constructor(secret: string) {
    this.key = Buffer.from(
      hkdfSync(
        'sha256',
        secret,
        'vortix-password-reset',
        'mail-payload/v1',
        32,
      ),
    );
  }

  seal(token: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), data]
      .map((part) => part.toString('base64url'))
      .join('.');
  }

  /** Null when the value was tampered with or sealed under another secret. */
  open(sealed: string): string | null {
    try {
      const [iv, tag, data] = sealed
        .split('.')
        .map((part) => Buffer.from(part, 'base64url'));
      const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
      decipher.setAuthTag(tag);
      const token = Buffer.concat([
        decipher.update(data),
        decipher.final(),
      ]).toString('utf8');
      return RESET_TOKEN_PATTERN.test(token) ? token : null;
    } catch {
      return null;
    }
  }
}
