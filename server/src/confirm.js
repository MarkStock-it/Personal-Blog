/**
 * The confirmation step of the signup: the link, and the message that carries it.
 *
 * Double opt-in is why the list is worth anything: without it anyone can type a stranger's address
 * into the form and subscribe them, and a list of addresses nobody agreed to would eventually cost
 * the account its sending privileges. The address is recorded at signup but stays unconfirmed — and
 * unconfirmed addresses are never pushed to Mailjet and never sent anything — until this link is
 * followed.
 *
 * The confirmation link asks before it acts (GET shows a button, POST confirms), matching the
 * unsubscribe route, so a mail scanner that opens links cannot subscribe anyone on its own.
 */
import { linkUrl, verifyLink } from './links.js';

export const CONFIRM_PATH = '/confirm';

/** The link for one address, or '' when the site cannot mint links yet. */
export function confirmUrl(email, { siteUrl = '', secret = '' } = {}) {
  return linkUrl('confirm', CONFIRM_PATH, email, { siteUrl, secret });
}

/** True only for a confirmation link this server issued for this address. Never throws. */
export function verifyConfirmToken(email, token, secret) {
  return verifyLink('confirm', email, token, secret);
}

/** The plain-text part: what arrives when the reader's mail app shows no HTML. It names the address
 *  for the same reason the HTML does: someone has to be able to see which address is being confirmed
 *  before they confirm it. */
function textBody({ name, url, email }) {
  return [
    `One more step, and you are on the list at ${name}.`,
    '',
    `The address is ${email}. Open this link to confirm it:`,
    url,
    '',
    'The link is only good for that address, and confirming is what puts you on the list.',
    'If you did not ask for this, ignore this message: nothing else happens, and the address is not',
    'subscribed to anything.',
    '',
    `— ${name}`,
  ].join('\n');
}

/**
 * The HTML part. Deliberately plain and light, in the site's own colours: no images, no tracking
 * pixel, and one link. Mail clients are not browsers, so the markup stays to tables-free
 * paragraphs with inline styles.
 */
function htmlBody({ name, url, email }) {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  return `<!DOCTYPE html>
<html lang="en">
<body style="margin:0;padding:28px 18px;background:#F7F5FB;color:#2B2742;font:400 17px/1.6 Georgia,serif">
  <div style="max-width:34rem;margin:0 auto">
    <p style="margin:0 0 18px;font:600 12px/1.25 ui-sans-serif,system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:#615C7D">${esc(name)}</p>
    <p style="margin:0 0 14px">One more step, and you are on the list.</p>
    <p style="margin:0 0 22px">Open this link to confirm <b>${esc(email)}</b>:</p>
    <p style="margin:0 0 22px"><a href="${esc(url)}" style="display:inline-block;padding:.7rem 1.2rem;border-radius:99px;background:#2B2742;color:#F7F5FB;text-decoration:none">Confirm my address</a></p>
    <p style="margin:0 0 14px;font-size:.95rem;color:#615C7D">The link works only for that address, and confirming is what puts you on the list.</p>
    <p style="margin:0;font-size:.95rem;color:#615C7D">If you did not ask for this, ignore this message: nothing else happens, and the address is not subscribed to anything.</p>
  </div>
</body>
</html>`;
}

/** The message itself: a subject, a text part and an HTML part. Pure, so it can be tested. */
export function confirmationEmail({ email, url, settings = {} }) {
  const name = String(settings.name || 'this blog').trim() || 'this blog';
  return {
    subject: `Confirm your subscription to ${name}`,
    text: textBody({ name, url, email }),
    html: htmlBody({ name, url, email }),
  };
}
