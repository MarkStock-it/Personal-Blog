/**
 * Tests for the confirmation step: the link and the message that carries it.
 *
 * The mail has to do three jobs at once — be openable as text, be openable as HTML, and carry a link
 * that only fits one address. It also has to say, plainly, that ignoring it is a valid answer, which
 * is the whole reason the list can be trusted. These pin all of that, plus that nothing in the
 * message phones home: no image, no pixel, no tracking.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { confirmUrl, verifyConfirmToken, confirmationEmail, CONFIRM_PATH } from '../src/confirm.js';

const SECRET = 'a-test-session-secret';
const settings = { name: 'Mark Ely Salinas' };

test('the confirmation link is tied to the address it was minted for', () => {
  const url = confirmUrl('mark@example.com', { siteUrl: 'https://elyplog.dcism.org', secret: SECRET });
  const token = new URL(url).searchParams.get('t');
  assert.equal(new URL(url).pathname, CONFIRM_PATH);
  assert.equal(new URL(url).searchParams.get('e'), 'mark@example.com');
  assert.equal(verifyConfirmToken('mark@example.com', token, SECRET), true);
  assert.equal(verifyConfirmToken('someone.else@example.com', token, SECRET), false);
});

test('without a site url or a secret there is no link to send', () => {
  assert.equal(confirmUrl('mark@example.com', { siteUrl: '', secret: SECRET }), '');
  assert.equal(confirmUrl('mark@example.com', { siteUrl: 'https://elyplog.dcism.org', secret: '' }), '');
});

test('the message names the blog, the address and the link, in both parts', () => {
  const url = confirmUrl('mark@example.com', { siteUrl: 'https://elyplog.dcism.org', secret: SECRET });
  const mail = confirmationEmail({ email: 'mark@example.com', url, settings });

  assert.equal(mail.subject, 'Confirm your subscription to Mark Ely Salinas');
  assert.ok(mail.text.includes(url), 'the text part carries the link as it is');
  assert.ok(mail.text.includes('mark@example.com'));
  /* An attribute must escape its &, so the html link is the same url, html-encoded. */
  assert.ok(mail.html.includes(url.replace(/&/g, '&amp;')), 'the html part carries the link, escaped');
  assert.ok(mail.html.includes('mark@example.com'));
  assert.ok(mail.text.includes('ignore'), 'ignoring it is offered as a real answer');
  assert.ok(mail.html.includes('ignore'));
});

test('a blank site name falls back rather than mailing a nameless subject', () => {
  const mail = confirmationEmail({ email: 'mark@example.com', url: 'https://x.test/confirm', settings: {} });
  assert.equal(mail.subject, 'Confirm your subscription to this blog');
  const blank = confirmationEmail({ email: 'mark@example.com', url: 'https://x.test/confirm', settings: { name: '   ' } });
  assert.equal(blank.subject, 'Confirm your subscription to this blog');
});

test('nothing in the message phones home, and the address is escaped into the html', () => {
  const mail = confirmationEmail({
    email: 'a"<b>@example.com',
    url: 'https://x.test/confirm?e=a&t=b',
    settings: { name: 'Mark & "Ely"' },
  });
  assert.equal(/<img|tracking|pixel/i.test(mail.html), false, 'no image or tracking pixel');
  assert.ok(mail.html.includes('a&quot;&lt;b&gt;@example.com'), 'the address is escaped');
  assert.ok(mail.html.includes('href="https://x.test/confirm?e=a&amp;t=b"'), 'and so is the link');
  assert.ok(mail.html.includes('Mark &amp; &quot;Ely&quot;'));
});
