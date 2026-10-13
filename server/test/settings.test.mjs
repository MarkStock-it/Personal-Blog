/**
 * Tests for the settings validation.
 *
 * The bug these pin: the site-details form marked `name` and `hero` required in the browser only,
 * so a POST that omitted or blanked them was written straight to the table — and because
 * getSettings merges rows over the defaults, an empty string *overrode* the default. The live
 * site then served `<title></title>` and an empty hero on every page.
 *
 * db.js builds a connection pool at import time (lazily, so importing is harmless); the pool is
 * closed in the final hook so the test process can exit.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  settingsError, REQUIRED_SETTINGS, SETTING_KEYS, SETTING_DEFAULTS, pool,
} from '../src/db.js';

test('a blank required setting is refused', () => {
  assert.equal(settingsError({ name: '' }), 'Your name cannot be blank.');
  assert.equal(settingsError({ hero: '' }), 'The hero statement cannot be blank.');
  assert.equal(settingsError({ name: '   ' }), 'Your name cannot be blank.');
  assert.equal(settingsError({ name: '\t\n' }), 'Your name cannot be blank.');
  assert.equal(settingsError({ hero: '  \n ' }), 'The hero statement cannot be blank.');
});

test('a missing required key is not an error, only a blank one is', () => {
  // A partial post (for example only `footer`) must stay legal and leave the rest untouched.
  assert.equal(settingsError({}), '');
  assert.equal(settingsError({ footer: 'Built with Node and MariaDB' }), '');
  assert.equal(settingsError({ name: 'Mark' }), '');
  assert.equal(settingsError({ hero: 'Say the thing out loud.' }), '');
  // Other fields may legitimately be empty.
  assert.equal(settingsError({ lede: '', about: '', colophon: '' }), '');
  assert.equal(settingsError({ name: 'Mark', lede: '' }), '');
});

test('a real value passes, including surrounding whitespace', () => {
  assert.equal(settingsError({ name: ' Mark ' }), '');
  assert.equal(settingsError({ hero: '  Say the thing.  ' }), '');
  // Whitespace that is not a plain space still counts as blank.
  assert.equal(settingsError({ name: '\u00a0' }), 'Your name cannot be blank.');
});

test('the required keys are real settings with non-blank defaults', () => {
  for (const key of REQUIRED_SETTINGS) {
    assert.ok(SETTING_KEYS.includes(key), `${key} must be a known setting`);
    // The fallback only protects the page if the default itself is usable.
    assert.notEqual(String(SETTING_DEFAULTS[key]).trim(), '');
  }
});

test('every setting key has a default, and the pool can be closed', async () => {
  assert.deepEqual(SETTING_KEYS, Object.keys(SETTING_DEFAULTS));
  await pool.end();
});
