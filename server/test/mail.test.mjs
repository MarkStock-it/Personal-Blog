/**
 * Tests for the confirmation send. A fake fetch stands in for the network, so these run offline.
 * They pin: nothing is sent without credentials, a sender and a recipient; the request Mailjet
 * actually expects; and that every kind of failure is reported as false and never thrown, because
 * the signup reply must not depend on the mail service being reachable.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { sendMail, MAILJET_SEND_URL } from '../src/mail.js';

const quiet = { error() {} };
const creds = { apiKey: 'pubkey', secretKey: 'privkey' };
const message = {
  from: 'hello@elyplog.dcism.org',
  fromName: 'Mark Ely Salinas',
  to: 'mark@example.com',
  subject: 'Confirm your subscription',
  text: 'plain part',
  html: '<p>html part</p>',
};

const fakeFetch = (status, body, calls) => async (url, init) => {
  calls.push({ url, init });
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
  });
};

test('without credentials, a sender or a recipient, nothing is sent', async () => {
  const calls = [];
  const fetchImpl = fakeFetch(200, undefined, calls);
  assert.equal(await sendMail(message, { ...creds, apiKey: '', fetchImpl, log: quiet }), false);
  assert.equal(await sendMail(message, { ...creds, secretKey: '', fetchImpl, log: quiet }), false);
  assert.equal(await sendMail({ ...message, from: '' }, { ...creds, fetchImpl, log: quiet }), false);
  assert.equal(await sendMail({ ...message, to: '' }, { ...creds, fetchImpl, log: quiet }), false);
  assert.equal(calls.length, 0);
});

test('the message goes to the send API with Basic auth and Mailjet\'s message shape', async () => {
  const calls = [];
  const ok = await sendMail(message, { ...creds, fetchImpl: fakeFetch(200, undefined, calls), log: quiet });
  assert.equal(ok, true);
  assert.equal(calls[0].url, MAILJET_SEND_URL);
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(
    calls[0].init.headers.authorization,
    `Basic ${Buffer.from('pubkey:privkey').toString('base64')}`,
  );
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    Messages: [{
      From: { Email: 'hello@elyplog.dcism.org', Name: 'Mark Ely Salinas' },
      To: [{ Email: 'mark@example.com' }],
      Subject: 'Confirm your subscription',
      TextPart: 'plain part',
      HTMLPart: '<p>html part</p>',
    }],
  });
});

test('an empty text or html part is left out rather than sent blank', async () => {
  const calls = [];
  await sendMail({ ...message, html: '' }, { ...creds, fetchImpl: fakeFetch(200, undefined, calls), log: quiet });
  assert.equal('HTMLPart' in JSON.parse(calls[0].init.body).Messages[0], false);
});

test('a rejected send is logged and reported as false, not thrown', async () => {
  const logged = [];
  const log = { error: (...args) => logged.push(args) };
  const ok = await sendMail(message, { ...creds, fetchImpl: fakeFetch(401, undefined, []), log });
  assert.equal(ok, false);
  assert.equal(logged.length, 1);
  assert.equal(logged[0][1], 401);
});

test('a 200 carrying a rejected message is not mistaken for a send', async () => {
  const logged = [];
  const log = { error: (...args) => logged.push(args) };
  const body = { Messages: [{ Status: 'error', Errors: [{ ErrorMessage: 'sender not validated' }] }] };
  const ok = await sendMail(message, { ...creds, fetchImpl: fakeFetch(200, body, []), log });
  assert.equal(ok, false);
  assert.equal(logged.length, 1);
  assert.match(String(logged[0][1]), /error/);
});

test('a 200 carrying a success is a send, and an unreadable body is not fatal', async () => {
  const success = { Messages: [{ Status: 'success' }] };
  assert.equal(await sendMail(message, { ...creds, fetchImpl: fakeFetch(200, success, []), log: quiet }), true);
  assert.equal(await sendMail(message, { ...creds, fetchImpl: fakeFetch(200, undefined, []), log: quiet }), true);
});

test('a network failure is logged and reported as false, not thrown', async () => {
  const logged = [];
  const log = { error: (...args) => logged.push(args) };
  const boom = async () => { throw new TypeError('fetch failed'); };
  const ok = await sendMail(message, { ...creds, fetchImpl: boom, log });
  assert.equal(ok, false);
  assert.equal(logged.length, 1);
});
