const product = 'Vortex Chess';

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );

const layout = (body: string) =>
  `<!doctype html><html><head><meta name="referrer" content="no-referrer"></head><body style="font-family:Arial,sans-serif;color:#111">
${body}
</body></html>`;

export function renderPasswordResetEmail(input: {
  to: string;
  link: string;
  expiresAt: Date;
  ttlMinutes: number;
}) {
  const expires = input.expiresAt.toUTCString();
  const subject = `Reset your ${product} password`;
  const text = [
    `Someone asked to reset the password for your ${product} account.`,
    '',
    `Choose a new password: ${input.link}`,
    '',
    `The link works once and expires in ${input.ttlMinutes} minutes (${expires}).`,
    `If you didn't ask for this, ignore this email; your password stays the same.`,
  ].join('\n');
  const html = layout(`<p>Someone asked to reset the password for your ${product} account.</p>
<p><a href="${escapeHtml(input.link)}" rel="noreferrer">Choose a new password</a></p>
<p>The link works once and expires in ${input.ttlMinutes} minutes (${escapeHtml(expires)}).</p>
<p style="color:#666">If you didn't ask for this, ignore this email; your password stays the same.</p>`);
  return { to: input.to, subject, text, html };
}

/** Contains no credentials: it only tells the owner that the password changed. */
export function renderPasswordChangedEmail(input: {
  to: string;
  changedAt: Date;
  signInLink: string;
}) {
  const changed = input.changedAt.toUTCString();
  const subject = `Your ${product} password was changed`;
  const text = [
    `The password for your ${product} account was changed on ${changed}.`,
    'Every device that was signed in has been signed out.',
    '',
    `Sign in: ${input.signInLink}`,
    '',
    `If you didn't make this change, reset your password straight away from the sign-in page.`,
  ].join('\n');
  const html = layout(`<p>The password for your ${product} account was changed on ${escapeHtml(changed)}.</p>
<p>Every device that was signed in has been signed out.</p>
<p><a href="${escapeHtml(input.signInLink)}">Sign in</a></p>
<p style="color:#666">If you didn't make this change, reset your password straight away from the sign-in page.</p>`);
  return { to: input.to, subject, text, html };
}
