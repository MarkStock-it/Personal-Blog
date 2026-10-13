/**
 * Tests for the dependency-free modules: the markdown parser and admin auth.
 * Run with: npm test   (node --test test/)
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { parseBody, inline, plainText } from '../src/markdown.js';
import {
  hashPassword, verifyPassword, issueSession, readSession, newSecret, safeEqual, verifyLogin,
} from '../src/auth.js';

test('inline escapes HTML before formatting', () => {
  assert.equal(inline('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
  assert.equal(inline('a & b'), 'a &amp; b');
  assert.equal(inline('quote " and \' apostrophe'), 'quote &quot; and &#39; apostrophe');
});

test('inline applies bold, emphasis and code', () => {
  assert.equal(inline('**bold**'), '<strong>bold</strong>');
  assert.equal(inline('*soft*'), '<em>soft</em>');
  assert.equal(inline('use `code` here'), 'use <code>code</code> here');
});

test('inline links only safe schemes', () => {
  assert.equal(inline('[x](https://example.com)'),
    '<a href="https://example.com" rel="noopener noreferrer">x</a>');
  assert.equal(inline('[x](/post/one)'),
    '<a href="/post/one" rel="noopener noreferrer">x</a>');
  // A dangerous scheme must stay as plain text, never become an anchor.
  assert.ok(!inline('[x](javascript:alert(1))').includes('<a '));
  assert.ok(inline('[x](javascript:alert(1))').includes('javascript:alert(1)'));
});

test('parseBody splits on blank lines and joins single newlines', () => {
  const blocks = parseBody('one two\nthree\n\nsecond');
  assert.deepEqual(blocks, [{ p: 'one two three' }, { p: 'second' }]);
});

test('parseBody makes pull quotes and margin notes', () => {
  const blocks = parseBody('A paragraph.\n\nNOTE: a margin aside\n\n> A pull quote');
  assert.deepEqual(blocks, [
    { p: 'A paragraph.', note: 'a margin aside' },
    { quote: 'A pull quote' },
  ]);
});

test('parseBody headings become bold paragraphs', () => {
  assert.deepEqual(parseBody('## A heading'), [{ p: '<strong>A heading</strong>' }]);
});

test('parseBody of empty input is an empty list', () => {
  assert.deepEqual(parseBody(''), []);
  assert.deepEqual(parseBody(undefined), []);
});

test('a note with no paragraph above it degrades to a paragraph', () => {
  assert.deepEqual(parseBody('NOTE: orphan'), [{ p: 'orphan' }]);
});

test('plainText strips tags and collapses whitespace', () => {
  const blocks = parseBody('Some **bold** text.\n\n> quoted');
  assert.equal(plainText(blocks), 'Some bold text. quoted');
});

test('password round-trips, and wrong or malformed input fails closed', () => {
  const record = hashPassword('correct horse battery staple');
  assert.match(record, /^scrypt\$\d+\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
  assert.equal(verifyPassword('correct horse battery staple', record), true);
  assert.equal(verifyPassword('wrong', record), false);
  assert.equal(verifyPassword('', record), false);
  assert.equal(verifyPassword('x', ''), false);
  assert.equal(verifyPassword('x', 'garbage'), false);
  assert.equal(verifyPassword('x', 'scrypt$16384$deadbeef$00'), false);
  assert.equal(hashPassword(''), '');
});

test('two hashes of one password differ, so salts are random', () => {
  assert.notEqual(hashPassword('same'), hashPassword('same'));
});

test('safeEqual compares without caring about length', () => {
  assert.equal(safeEqual('abc', 'abc'), true);
  assert.equal(safeEqual('abc', 'abd'), false);
  assert.equal(safeEqual('abc', 'abcd'), false);   // different lengths must not throw
  assert.equal(safeEqual('', ''), true);
  assert.equal(safeEqual('', 'x'), false);
  assert.equal(safeEqual(null, ''), true);
});

test('signing in needs both the right username and the right password', () => {
  const hash = hashPassword('Mongju09!');
  assert.equal(verifyLogin('markelysalinas', 'Mongju09!', 'markelysalinas', hash), true);
  assert.equal(verifyLogin('  markelysalinas  ', 'Mongju09!', 'markelysalinas', hash), true); // pasted spaces
  assert.equal(verifyLogin('someone-else', 'Mongju09!', 'markelysalinas', hash), false);
  assert.equal(verifyLogin('markelysalinas', 'wrong', 'markelysalinas', hash), false);
  assert.equal(verifyLogin('', 'Mongju09!', 'markelysalinas', hash), false);
  assert.equal(verifyLogin('markelysalinas', '', 'markelysalinas', hash), false);
  assert.equal(verifyLogin('markelysalinas', 'Mongju09!', '', hash), false);
  assert.equal(verifyLogin('markelysalinas', 'Mongju09!', 'markelysalinas', ''), false);
  assert.equal(verifyLogin('markelysalinas', 'Mongju09!', 'markelysalinas', 'garbage'), false);
  assert.equal(verifyLogin(null, null, 'markelysalinas', hash), false);
});

test('sessions verify, reject tampering and expire', () => {
  const secret = newSecret();
  assert.equal(secret.length, 64);

  const token = issueSession(secret, 60_000);
  const ok = readSession(secret, token);
  assert.equal(ok.ok, true);
  assert.ok(ok.exp > Date.now());

  assert.equal(readSession(secret, token + 'x').ok, false);          // tampered signature
  assert.equal(readSession(newSecret(), token).ok, false);           // wrong secret
  assert.equal(readSession(secret, 'not-a-token').ok, false);
  assert.equal(readSession(secret, '').ok, false);
  assert.equal(readSession('', token).ok, false);
  assert.equal(readSession(secret, issueSession(secret, -1000)).ok, false); // expired
});

test('a forged payload cannot pass without the secret', () => {
  const secret = newSecret();
  const forged = Buffer.from(JSON.stringify({ exp: Date.now() + 10_000 })).toString('base64url');
  assert.equal(readSession(secret, `${forged}.${forged}`).ok, false);
});
