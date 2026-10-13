/**
 * Tests for the bulk post actions on the posts list.
 *
 * parseBulkRequest is the only thing between the browser and the SQL that publishes or deletes
 * several posts, so these pin what it accepts and what it refuses. db.js builds a connection pool
 * at import time (lazily); the pool is closed in the final hook so the test process can exit.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { parseBulkRequest, BULK_ACTIONS, BULK_MAX, pool } from '../src/db.js';

test('a known action with a list of ids is accepted, as numbers and de-duplicated', () => {
  assert.deepEqual(parseBulkRequest({ action: 'publish', ids: ['3', '7', '3'] }), { action: 'publish', ids: [3, 7] });
  assert.deepEqual(parseBulkRequest({ action: 'delete', ids: ['12'] }), { action: 'delete', ids: [12] });
  assert.deepEqual(parseBulkRequest({ action: 'unpublish', ids: [' 4 ', '5'] }), { action: 'unpublish', ids: [4, 5] });
});

test('a single id that the form sends as a string still counts as a list', () => {
  assert.deepEqual(parseBulkRequest({ action: 'publish', ids: '9' }), { action: 'publish', ids: [9] });
});

test('an unknown or missing action is refused', () => {
  assert.ok(parseBulkRequest({ action: 'purge', ids: ['1'] }).error);
  assert.ok(parseBulkRequest({ ids: ['1'] }).error);
  assert.ok(parseBulkRequest({ action: ['publish'], ids: ['1'] }).error);
  assert.deepEqual(BULK_ACTIONS, ['publish', 'unpublish', 'delete']);
});

test('an empty selection is refused, including blank entries', () => {
  assert.equal(parseBulkRequest({ action: 'delete' }).error, 'Select at least one post first.');
  assert.equal(parseBulkRequest({ action: 'delete', ids: [] }).error, 'Select at least one post first.');
  assert.equal(parseBulkRequest({ action: 'delete', ids: ['', '  '] }).error, 'Select at least one post first.');
});

test('anything that is not a whole number id is refused before it reaches SQL', () => {
  const bad = ['1; DROP TABLE posts', '1 OR 1=1', '-3', '2.5', 'abc', '0x1F', '1e3'];
  for (const value of bad) {
    assert.equal(
      parseBulkRequest({ action: 'delete', ids: ['2', value] }).error,
      'Those post ids are not valid.',
      `should refuse ${JSON.stringify(value)}`,
    );
  }
});

test('a selection larger than the cap is refused, and the cap itself is allowed', () => {
  const atCap = Array.from({ length: BULK_MAX }, (_, i) => String(i + 1));
  assert.equal(parseBulkRequest({ action: 'publish', ids: atCap }).ids.length, BULK_MAX);
  const over = [...atCap, String(BULK_MAX + 1)];
  assert.equal(parseBulkRequest({ action: 'publish', ids: over }).error, `You can change at most ${BULK_MAX} posts at once.`);
});

test('the pool can be closed', async () => {
  await pool.end();
});
