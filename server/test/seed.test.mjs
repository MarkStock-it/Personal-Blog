/**
 * Tests for the starting content.
 *
 * The template's three posts are seeded so a new install has something to look at — but they used to
 * be seeded `published: 1`, which put lorem text in front of visitors on the live site. They are
 * drafts now, and the migration must not override that.
 *
 * Run with: npm test   (node --test test/)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { SEED_POSTS } from '../src/seed.js';

const migrate = await readFile(new URL('../src/migrate.js', import.meta.url), 'utf8');

test('every seed post is a draft, so a fresh install shows a visitor nothing', () => {
  assert.ok(SEED_POSTS.length >= 3, 'the three template pieces are still there');
  for (const post of SEED_POSTS) {
    assert.equal(post.published, false, `${post.slug} must be seeded unpublished`);
  }
});

test('the seed posts carry everything the posts table needs', () => {
  for (const post of SEED_POSTS) {
    for (const field of ['slug', 'title', 'date', 'topic', 'excerpt', 'body']) {
      assert.ok(post[field], `${post.slug} is missing ${field}`);
    }
    assert.match(post.slug, /^[a-z0-9-]+$/, `${post.slug} must be a usable slug`);
  }
  assert.equal(new Set(SEED_POSTS.map(p => p.slug)).size, SEED_POSTS.length, 'slugs are unique');
});

test('the migration writes the seed posts as they are, never forcing them live', () => {
  const writes = [...migrate.matchAll(/savePost\(([\s\S]*?)\)/g)].map(m => m[1]);
  assert.ok(writes.length, 'the migration still seeds posts');
  for (const write of writes) {
    assert.ok(!/published/.test(write),
      `the seeding call must not set published itself, found savePost(${write.trim()})`);
  }
  assert.match(migrate, /savePost\(post\)/, 'the seed post is saved as it is written in seed.js');
});
