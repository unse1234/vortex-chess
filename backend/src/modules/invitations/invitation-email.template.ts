import type { TimeControl } from '../rooms/time-controls';

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );

function describeTimeControl({ category, initialMs, incrementMs }: TimeControl) {
  const label = category[0].toUpperCase() + category.slice(1);
  return `${label} ${Math.round(initialMs / 60_000)}+${Math.round(incrementMs / 1000)}`;
}

const colorText = {
  white: 'plays White',
  black: 'plays Black',
  random: 'colours are assigned at random',
} as const;

export function renderInvitationEmail(input: {
  to: string;
  senderUsername: string;
  timeControl: TimeControl;
  colorPreference: keyof typeof colorText;
  expiresAt: Date;
  link: string;
}) {
  const product = 'Vortex Chess';
  const timeControl = describeTimeControl(input.timeControl);
  const expires = input.expiresAt.toUTCString();
  const subject = `${input.senderUsername} invited you to a game on ${product}`;
  const text = [
    `${input.senderUsername} invited you to a private ${timeControl} game on ${product} (host ${colorText[input.colorPreference]}).`,
    '',
    `Open the invitation: ${input.link}`,
    '',
    `Sign in with this account to accept or decline. The invitation expires ${expires}.`,
    `If you weren't expecting this, you can ignore this email.`,
  ].join('\n');
  const sender = escapeHtml(input.senderUsername);
  const link = escapeHtml(input.link);
  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#111">
<p><strong>${sender}</strong> invited you to a private <strong>${escapeHtml(timeControl)}</strong> game on ${product} (host ${colorText[input.colorPreference]}).</p>
<p><a href="${link}">Open the invitation</a></p>
<p>Sign in with this account to accept or decline. The invitation expires ${escapeHtml(expires)}.</p>
<p style="color:#666">If you weren't expecting this, you can ignore this email.</p>
</body></html>`;
  return { to: input.to, subject, text, html };
}
