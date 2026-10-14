/**
 * Tests for the Mailjet contact sync. A fake fetch stands in for the network, so these run offline.
 * They pin: missing credentials or list id means no request, the URL, the Basic auth header and the
 * body, and that a Mailjet failure is reported as false and never thrown (the signup must still succeed).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { syncMailjetContact, removeMailjetContact, mailjetManageContactUrl } from '../src/mailjet.js';

const quiet = { error() {} };
const creds = { apiKey: 'pubkey', secretKey: 'privkey', listId: '7' };

function fakeFetch(status, calls) {
  return async (url, init) => {
    calls.push({ url, init });
    return new Response(null, { status });
  };
}

test('without the API key, the secret key or a list id, nothing is sent', async () => {
  const calls = [];
  const fetchImpl = fakeFetch(201, calls);
  assert.equal(await syncMailjetContact('mark@example.com', { ...creds, apiKey: '', fetchImpl, log: quiet }), false);
  assert.equal(await syncMailjetContact('mark@example.com', { ...creds, secretKey: '', fetchImpl, log: quiet }), false);
  assert.equal(await syncMailjetContact('mark@example.com', { ...creds, listId: '', fetchImpl, log: quiet }), false);
  assert.equal(calls.length, 0);
});

test('a list id that is not a positive number sends nothing', async () => {
  const calls = [];
  const fetchImpl = fakeFetch(201, calls);
  await syncMailjetContact('mark@example.com', { ...creds, listId: 'abc', fetchImpl, log: quiet });
  await syncMailjetContact('mark@example.com', { ...creds, listId: '0', fetchImpl, log: quiet });
  assert.equal(calls.length, 0);
});

test('with credentials, it posts the address to the list with Basic auth', async () => {
  const calls = [];
  const ok = await syncMailjetContact('mark@example.com', { ...creds, fetchImpl: fakeFetch(201, calls), log: quiet });
  assert.equal(ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.mailjet.com/v3/REST/contactslist/7/managecontact');
  assert.equal(calls[0].url, mailjetManageContactUrl(7));
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(
    calls[0].init.headers.authorization,
    `Basic ${Buffer.from('pubkey:privkey').toString('base64')}`,
  );
  assert.deepEqual(JSON.parse(calls[0].init.body), { Action: 'addnoforce', Email: 'mark@example.com' });
});

test('a success response other than 201 (for example 200) still counts as success', async () => {
  const ok = await syncMailjetContact('mark@example.com', { ...creds, fetchImpl: fakeFetch(200, []), log: quiet });
  assert.equal(ok, true);
});

test('rejected credentials are logged and reported as false, not thrown', async () => {
  const logged = [];
  const log = { error: (...args) => logged.push(args) };
  const ok = await syncMailjetContact('mark@example.com', { ...creds, fetchImpl: fakeFetch(401, []), log });
  assert.equal(ok, false);
  assert.equal(logged.length, 1);
  assert.equal(logged[0][1], 401);
});

test('a network failure is logged and reported as false, not thrown', async () => {
  const logged = [];
  const log = { error: (...args) => logged.push(args) };
  const boom = async () => { throw new TypeError('fetch failed'); };
  const ok = await syncMailjetContact('mark@example.com', { ...creds, fetchImpl: boom, log });
  assert.equal(ok, false);
  assert.equal(logged.length, 1);
});

test('removal sends the unsub action to the same list operation', async () => {
  const calls = [];
  const ok = await removeMailjetContact('mark@example.com', { ...creds, fetchImpl: fakeFetch(201, calls), log: quiet });
  assert.equal(ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, mailjetManageContactUrl(7));
  assert.equal(calls[0].init.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].init.body), { Action: 'unsub', Email: 'mark@example.com' });
});

test('removal without credentials sends nothing, but a failure is reported and not thrown', async () => {
  const calls = [];
  assert.equal(
    await removeMailjetContact('mark@example.com', { ...creds, listId: '', fetchImpl: fakeFetch(200, calls), log: quiet }),
    false,
  );
  assert.equal(calls.length, 0);
  const logged = [];
  const log = { error: (...args) => logged.push(args) };
  const ok = await removeMailjetContact('mark@example.com', { ...creds, fetchImpl: fakeFetch(401, []), log });
  assert.equal(ok, false);
  assert.equal(logged[0][1], 401);
  /* The label names the removal, so a log line says which of the two calls went wrong. */
  assert.match(String(logged[0][0]), /removal/);
});
