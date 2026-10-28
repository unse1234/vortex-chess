import { resetPasswordSchema } from './auth.schemas';
import {
  renderPasswordChangedEmail,
  renderPasswordResetEmail,
} from './password-reset-email.template';
import {
  RESET_TOKEN_PATTERN,
  ResetTokenSealer,
  generateResetToken,
} from './password-reset-token';

describe('Password reset tokens', () => {
  it('generates 256-bit url-safe tokens', () => {
    const tokens = new Set(Array.from({ length: 50 }, generateResetToken));
    expect(tokens.size).toBe(50);
    for (const token of tokens) {
      expect(token).toMatch(RESET_TOKEN_PATTERN);
      expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    }
  });

  it('seals tokens so only the same secret can open them, and detects tampering', () => {
    const token = generateResetToken();
    const sealer = new ResetTokenSealer('a'.repeat(48));
    const sealed = sealer.seal(token);
    expect(sealed).not.toContain(token);
    expect(sealed.length).toBeLessThanOrEqual(200);
    expect(sealer.seal(token)).not.toBe(sealed);
    expect(sealer.open(sealed)).toBe(token);
    expect(new ResetTokenSealer('b'.repeat(48)).open(sealed)).toBeNull();
    const [iv, tag, data] = sealed.split('.');
    const flipped = (data[0] === 'A' ? 'B' : 'A') + data.slice(1);
    expect(sealer.open([iv, tag, flipped].join('.'))).toBeNull();
    expect(sealer.open('garbage')).toBeNull();
  });
});

describe('Password reset emails', () => {
  const link = 'https://play.vortex.invalid/reset-password#token=abc<script>';

  it('includes the link and expiry, escaping HTML', () => {
    const mail = renderPasswordResetEmail({
      to: 'player@example.com',
      link,
      expiresAt: new Date('2026-10-28T12:30:00Z'),
      ttlMinutes: 30,
    });
    expect(mail.to).toBe('player@example.com');
    expect(mail.text).toContain(link);
    expect(mail.text).toContain('expires in 30 minutes');
    expect(mail.html).toContain('abc&lt;script&gt;');
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('no-referrer');
  });

  it('sends a change notice without credentials', () => {
    const mail = renderPasswordChangedEmail({
      to: 'player@example.com',
      changedAt: new Date('2026-10-28T12:30:00Z'),
      signInLink: 'https://play.vortex.invalid/sign-in',
    });
    expect(mail.subject).toMatch(/was changed/);
    expect(mail.text).not.toMatch(/token|#/);
    expect(mail.text).toContain('signed out');
  });
});

describe('Reset password input', () => {
  const valid = { token: 'x', password: 'new-password-1', confirmPassword: 'new-password-1' };
  it('applies the registration password policy and confirmation', () => {
    expect(resetPasswordSchema.safeParse(valid).success).toBe(true);
    expect(resetPasswordSchema.safeParse({ ...valid, password: 'short', confirmPassword: 'short' }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ ...valid, confirmPassword: 'other-password' }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ ...valid, extra: true }).success).toBe(false);
    const long = 'p'.repeat(129);
    expect(resetPasswordSchema.safeParse({ ...valid, password: long, confirmPassword: long }).success).toBe(false);
  });
});
