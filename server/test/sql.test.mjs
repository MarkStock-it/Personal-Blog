import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { statements, stripComments } from '../src/sql.js';

test('splits on statement terminators', () => {
  assert.deepEqual(statements('SELECT 1;\nSELECT 2;\n'), ['SELECT 1', 'SELECT 2']);
});

test('ignores -- line comments', () => {
  const out = statements('-- a note\nSELECT 1;\n-- another note\nSELECT 2;\n');
  assert.deepEqual(out, ['SELECT 1', 'SELECT 2']);
  assert.equal(stripComments('a\n-- drop me\nb'), 'a\nb');
});

test('a semicolon inside a string literal does not split the statement', () => {
  const sql = "CREATE TABLE t (a INT COMMENT 'first; second', b INT);\n";
  const out = statements(sql);
  assert.equal(out.length, 1, `expected one statement, got ${JSON.stringify(out)}`);
  assert.ok(out[0].includes("'first; second'"), 'the literal must survive intact');
});

test('the real schema splits into whole statements', () => {
  return readFile(new URL('../schema.sql', import.meta.url), 'utf8').then(sql => {
    const out = statements(sql);
    // posts, settings and subscribers: one statement per table.
    assert.equal(out.length, 3, `expected 3 statements, got ${out.length}`);
    for (const statement of out) {
      // A split inside a string literal leaves an odd number of quotes behind.
      const quotes = (statement.match(/'/g) || []).length;
      assert.equal(quotes % 2, 0, `unbalanced quotes in: ${statement.slice(0, 60)}…`);
      assert.ok(/^CREATE TABLE IF NOT EXISTS/.test(statement), statement.slice(0, 40));
    }
    assert.ok(out[0].includes('COMMENT'), 'comments are kept in the statement');
  });
});

test('empty input yields no statements', () => {
  assert.deepEqual(statements(''), []);
  assert.deepEqual(statements('   \n\n'), []);
  assert.deepEqual(statements('-- only a comment\n'), []);
});
