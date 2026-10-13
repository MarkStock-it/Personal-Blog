#!/usr/bin/env node
/**
 * Applies schema.sql and fills in the starting content. Safe to run more than once:
 *   - tables are created IF NOT EXISTS;
 *   - settings are inserted only when the key is missing, so edited copy is never overwritten;
 *   - seed posts are written only into an empty posts table.
 *
 * Usage:  npm run migrate
 */
import { readFile } from 'node:fs/promises';

import {
  pool, SETTING_DEFAULTS, countPosts, ensurePostColumns, getPostRawBySlug, savePost, setSetting,
} from './db.js';
import { SEED_POSTS } from './seed.js';
import { statements } from './sql.js';

const schemaPath = new URL('../schema.sql', import.meta.url);

async function main() {
  const sql = await readFile(schemaPath, 'utf8');
  const list = statements(sql);

  for (const statement of list) {
    await pool.query(statement);
  }
  console.log(`schema: applied ${list.length} statement(s)`);

  /* Newer columns, for a posts table that already exists: CREATE TABLE IF NOT EXISTS never adds one. */
  const added = await ensurePostColumns();
  console.log(added.length
    ? `columns: added ${added.join(', ')}`
    : 'columns: posts table is up to date');

  let settingsAdded = 0;
  for (const [key, value] of Object.entries(SETTING_DEFAULTS)) {
    const [rows] = await pool.query('SELECT k FROM settings WHERE k = ?', [key]);
    if (!rows.length) {
      await setSetting(key, value);
      settingsAdded += 1;
    }
  }
  console.log(`settings: ${settingsAdded} default(s) inserted, ${Object.keys(SETTING_DEFAULTS).length - settingsAdded} already present`);

  const existing = await countPosts();
  let postsAdded = 0;
  if (existing === 0) {
    for (const post of SEED_POSTS) {
      if (await getPostRawBySlug(post.slug)) continue;
      await savePost({ ...post, published: 1 });
      postsAdded += 1;
    }
    console.log(`posts: seeded ${postsAdded} placeholder post(s) from src/seed.js`);
  } else {
    console.log(`posts: ${existing} already present, nothing seeded`);
  }

  const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM posts');
  const [[{ s }]] = await pool.query('SELECT COUNT(*) AS s FROM settings');
  console.log(`done: ${n} post(s), ${s} setting(s)`);
}

main()
  .then(() => pool.end())
  .catch(async err => {
    console.error('migrate failed:', err.message);
    await pool.end().catch(() => {});
    process.exit(1);
  });
