/**
 * Tests for unsubscribe links. The token is what makes removal safe: only a link this server minted
 * for that exact address may remove it, so these pin the round trip and, more importantly, every way
 * it must fail — another address, one flipped character, another secret, no secret at all.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  unsubscribeToken, verifyUnsubscribeToken, unsubscribeUrl, UNSUBSCRIBE_PATH,
} from '../src/unsubscribe.js';

const SECRET = 'a-test-session-secret';

test('a token verifies for the address it was made for', () => {
  const token = unsubscribeToken('mark@example.com', SECRET);
  assert.ok(token.length > 20, 'the token is long enough to be unguessable');
  assert.equal(verifyUnsubscribeToken('mark@example.com', token, SECRET), true);
});

test('the address is normalised, so case and padding do not change the link', () => {
  const token = unsubscribeToken('  Mark@Example.COM ', SECRET);
  assert.equal(token, unsubscribeToken('mark@example.com', SECRET));
  assert.equal(verifyUnsubscribeToken('MARK@example.com', token, SECRET), true);
});

test('a token for one address is refused for another', () => {
  const token = unsubscribeToken('mark@example.com', SECRET);
  assert.equal(verifyUnsubscribeToken('someone.else@example.com', token, SECRET), false);
});

test('a tampered token is refused', () => {
  const token = unsubscribeToken('mark@example.com', SECRET);
  const flipped = token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A');
  assert.equal(verifyUnsubscribeToken('mark@example.com', flipped, SECRET), false);
  assert.equal(verifyUnsubscribeToken('mark@example.com', `${token}x`, SECRET), false);
  assert.equal(verifyUnsubscribeToken('mark@example.com', '', SECRET), false);
  assert.equal(verifyUnsubscribeToken('mark@example.com', undefined, SECRET), false);
});

test('a token minted with another secret is refused', () => {
  const token = unsubscribeToken('mark@example.com', 'the-other-secret');
  assert.equal(verifyUnsubscribeToken('mark@example.com', token, SECRET), false);
});

test('without a secret or an address, nothing can be signed and nothing verifies', () => {
  assert.equal(unsubscribeToken('mark@example.com', ''), '');
  assert.equal(unsubscribeToken('', SECRET), '');
  assert.equal(verifyUnsubscribeToken('mark@example.com', unsubscribeToken('mark@example.com', ''), ''), false);
});

test('the link carries the address and its token, and loses any trailing slash', () => {
  const url = unsubscribeUrl('mark@example.com', { siteUrl: 'https://elyplog.dcism.org/', secret: SECRET });
  const [base, query] = url.split('?');
  assert.equal(base, `https://elyplog.dcism.org${UNSUBSCRIBE_PATH}`);
  const params = new URLSearchParams(query);
  assert.equal(params.get('e'), 'mark@example.com');
  assert.equal(params.get('t'), unsubscribeToken('mark@example.com', SECRET));
});

test('without a site url there is no link to send', () => {
  assert.equal(unsubscribeUrl('mark@example.com', { siteUrl: '', secret: SECRET }), '');
  assert.equal(unsubscribeUrl('mark@example.com', { siteUrl: 'https://elyplog.dcism.org', secret: '' }), '');
});
