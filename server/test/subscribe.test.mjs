/**
 * Tests for the newsletter signup's email check.
 *
 * The check is deliberately loose (see normaliseEmail): it only has to turn obvious junk away
 * before it reaches the table. These tests pin what is accepted, what is refused, and that the
 * address is stored in one normal form, so `Mark@Example.com` and `mark@example.com` are one row.
 *
 * db.js builds a connection pool at import time (lazily); the pool is closed in the final test so
 * the test process can exit.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { normaliseEmail, pool } from '../src/db.js';

test('a plausible address is accepted, trimmed and lower-cased', () => {
  assert.equal(normaliseEmail('mark@example.com'), 'mark@example.com');
  assert.equal(normaliseEmail('  Mark@Example.COM  '), 'mark@example.com');
  assert.equal(normaliseEmail('first.last+news@sub.example.org'), 'first.last+news@sub.example.org');
});

test('obvious junk is refused', () => {
  for (const value of ['', '   ', 'plain', 'no-at-sign.com', '@example.com', 'a@b', 'a b@example.com', 'a@@example.com', 'a@example.']) {
    assert.equal(normaliseEmail(value), '', `${JSON.stringify(value)} should be refused`);
  }
  assert.equal(normaliseEmail(undefined), '');
  assert.equal(normaliseEmail(null), '');
});

test('an address longer than the column allows is refused', () => {
  const local = 'a'.repeat(64);
  const domain = `${'b'.repeat(60)}.${'c'.repeat(60)}.${'d'.repeat(60)}.example`;
  assert.equal(normaliseEmail(`${local}@${domain}`), '');
});

test('the database pool can be closed', async () => {
  await pool.end();
});
