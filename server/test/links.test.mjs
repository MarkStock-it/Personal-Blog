/**
 * Tests for the signed links both the confirmation mail and the unsubscribe mail carry.
 *
 * The point of the token is that it is bound to one address AND one purpose: a token that removes
 * someone must never be able to subscribe them, and a token minted for one address must never work
 * for another. These pin that, plus the empty-input cases that keep a half-configured site quiet
 * rather than broken.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { linkToken, verifyLink, linkUrl, LINK_KINDS } from '../src/links.js';

const SECRET = 'a-test-session-secret';

test('a token verifies for its own address and purpose', () => {
  const token = linkToken('confirm', 'mark@example.com', SECRET);
  assert.ok(token.length > 20, 'long enough to be unguessable');
  assert.equal(verifyLink('confirm', 'mark@example.com', token, SECRET), true);
  assert.equal(verifyLink('confirm', '  Mark@Example.COM ', token, SECRET), true, 'case and padding are normalised');
});

test('the two purposes cannot be swapped', () => {
  for (const kind of LINK_KINDS) {
    const other = LINK_KINDS.find(k => k !== kind);
    const token = linkToken(kind, 'mark@example.com', SECRET);
    assert.equal(verifyLink(other, 'mark@example.com', token, SECRET), false,
      `a ${kind} token must not work as a ${other} token`);
  }
  assert.notEqual(
    linkToken('confirm', 'mark@example.com', SECRET),
    linkToken('unsubscribe', 'mark@example.com', SECRET),
  );
});

test('a token for one address is refused for another, and tampering is refused', () => {
  const token = linkToken('confirm', 'mark@example.com', SECRET);
  assert.equal(verifyLink('confirm', 'someone.else@example.com', token, SECRET), false);
  assert.equal(verifyLink('confirm', 'mark@example.com', `${token}x`, SECRET), false);
  assert.equal(verifyLink('confirm', 'mark@example.com', '', SECRET), false);
  assert.equal(verifyLink('confirm', 'mark@example.com', undefined, SECRET), false);
  assert.equal(verifyLink('confirm', 'mark@example.com', token, 'another-secret'), false);
});

test('an unknown kind, a missing address or a missing secret mints nothing', () => {
  assert.equal(linkToken('delete-everything', 'mark@example.com', SECRET), '');
  assert.equal(linkToken('confirm', '', SECRET), '');
  assert.equal(linkToken('confirm', 'mark@example.com', ''), '');
  assert.equal(linkToken('delete-everything', 'mark@example.com', SECRET), '');
  assert.equal(verifyLink('delete-everything', 'mark@example.com', 'anything', SECRET), false);
});

test('a link carries the address, its token and the path it was asked for', () => {
  const url = linkUrl('confirm', '/confirm', 'Mark@Example.com', { siteUrl: 'https://elyplog.dcism.org/', secret: SECRET });
  const [base, query] = url.split('?');
  assert.equal(base, 'https://elyplog.dcism.org/confirm');
  const params = new URLSearchParams(query);
  assert.equal(params.get('e'), 'mark@example.com');
  assert.equal(params.get('t'), linkToken('confirm', 'mark@example.com', SECRET));

  assert.equal(linkUrl('confirm', '/confirm', 'mark@example.com', { siteUrl: '', secret: SECRET }), '');
  assert.equal(linkUrl('confirm', '/confirm', 'mark@example.com', { siteUrl: 'https://x.test', secret: '' }), '');
});
