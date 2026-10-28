import {
  RESET_TOKEN_PATTERN,
  ResetTokenSealer,
  generateResetToken,
} from './password-reset-token';
import {
  renderPasswordChangedEmail,
  renderPasswordResetEmail,
} from './password-reset-email.template';

describe('Password reset tokens', () => {
  it('generates distinct 256-bit base64url tokens', () => {
    const tokens = new Set(Array.from({ length: 200 }, generateResetToken));
    expect(tokens.size).toBe(200);
    for (const token of tokens) {
      expect(token).toMatch(RESET_TOKEN_PATTERN);
      expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    }
  });

  it('seals for the worker without exposing the token, and detects tampering or another secret', () => {
    const sealer = new ResetTokenSealer('s'.repeat(48));
    const token = generateResetToken();
    const sealed = sealer.seal(token);
    expect(sealed).not.toContain(token);
    expect(sealed.length).toBeLessThanOrEqual(200);
    expect(sealer.seal(token)).not.toBe(sealed);
    expect(sealer.open(sealed)).toBe(token);
    const [iv, tag, data] = sealed.split('.');
    const flipped = `${iv}.${tag}.${data[0] === 'A' ? 'B' : 'A'}${data.slice(1)}`;
    expect(sealer.open(flipped)).toBeNull();
    expect(new ResetTokenSealer('t'.repeat(48)).open(sealed)).toBeNull();
    expect(sealer.open('garbage')).toBeNull();
  });
});

describe('Password recovery emails', () => {
  const link = 'https://play.example/reset-password#token=abc"<x>';
  it('builds the reset email with the escaped link and expiry', () => {
    const expiresAt = new Date('2026-10-28T12:30:00Z');
    const mail = renderPasswordResetEmail({
      to: 'a@example.com',
      link,
      expiresAt,
      ttlMinutes: 30,
    });
    expect(mail.to).toBe('a@example.com');
    expect(mail.subject).toMatch(/Reset your Vortex Chess password/);
    expect(mail.text).toContain(link);
    expect(mail.text).toContain('30 minutes');
    expect(mail.text).toContain(expiresAt.toUTCString());
    expect(mail.html).toContain('reset-password#token=abc&quot;&lt;x&gt;');
    expect(mail.html).not.toContain('abc"<x>');
    expect(mail.html).toContain('no-referrer');
  });

  it('sends a changed notice with no credentials', () => {
    const mail = renderPasswordChangedEmail({
      to: 'a@example.com',
      changedAt: new Date('2026-10-28T12:00:00Z'),
      signInLink: 'https://play.example/sign-in',
    });
    expect(mail.text).toContain('https://play.example/sign-in');
    expect(`${mail.text}${mail.html}`).not.toMatch(/token|reset-password/);
  });
});
