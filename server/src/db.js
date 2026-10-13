/**
 * Data access. Everything the page needs comes from MariaDB; there is no file-based content.
 *
 * Note `dateStrings: true` on the pool: DATE columns come back as 'YYYY-MM-DD' strings, which is
 * exactly what the page compares (localeCompare) and formats, so no timezone can shift a day.
 */
import mysql from 'mysql2/promise';

import { parseBody } from './markdown.js';

const num = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback);

export const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: num(process.env.DB_PORT, 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 5,
  charset: 'utf8mb4',
  dateStrings: true,
});

/* Site copy defaults. Seeded into `settings` on first migrate, editable at /admin afterwards. */
export const SETTING_DEFAULTS = {
  name: 'Your Name',
  hero: 'Say the thing out loud.',
  lede: 'One or two sentences about who you are and why you write.',
  description: 'A personal blog: essays and notes, written by hand.',
  aboutTitle: 'About',
  aboutDescription: 'Who writes here and why.',
  about: 'A short bio in your own voice: why you write, what readers can expect, how often you post.\n\nNOTE: Margin notes work here too.\n\nWhat this is not: a feed, a brand, or a place that tracks you.',
  colophon: 'A personal blog. Essays and notes on whatever I am thinking about — written by hand, no tracking and no ads.',
  footer: 'Built with Node and MariaDB',
};

export const SETTING_KEYS = Object.keys(SETTING_DEFAULTS);

/* The site's identity. A blank value here empties the nav, the hero and <title> on *every* page,
   so a blank one is neither saved (settingsError) nor believed once stored (getSettings). */
export const REQUIRED_SETTINGS = ['name', 'hero'];

const REQUIRED_LABELS = { name: 'Your name', hero: 'The hero statement' };

/** The first unacceptable value in a submitted settings form, or '' when the form is fine. */
export function settingsError(submitted) {
  for (const key of REQUIRED_SETTINGS) {
    if (key in submitted && String(submitted[key] ?? '').trim() === '') {
      return `${REQUIRED_LABELS[key]} cannot be blank.`;
    }
  }
  return '';
}

/** All settings, merged over the defaults so a missing row can never break the page. A blank
    required value counts as missing: the page keeps its identity rather than losing its name. */
export async function getSettings() {
  const [rows] = await pool.query('SELECT k, v FROM settings');
  const out = { ...SETTING_DEFAULTS };
  for (const row of rows) {
    if (!(row.k in out)) continue;
    const blankRequired = REQUIRED_SETTINGS.includes(row.k) && String(row.v ?? '').trim() === '';
    out[row.k] = blankRequired ? SETTING_DEFAULTS[row.k] : row.v;
  }
  return out;
}

export async function setSetting(key, value) {
  if (!SETTING_KEYS.includes(key)) throw new Error(`unknown setting: ${key}`);
  await pool.query(
    'INSERT INTO settings (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)',
    [key, String(value ?? '')],
  );
}

const toDate = value => {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value ?? '').slice(0, 10);
};

const toPost = row => ({
  id: row.id,
  slug: row.slug,
  title: row.title,
  date: toDate(row.published_at),
  topic: row.topic,
  excerpt: row.excerpt,
  depth: row.depth === null || row.depth === undefined ? null : Number(row.depth),
  tint: row.tint || null,
  tags: splitTags(row.tags),
  metaTitle: row.meta_title || '',
  metaDescription: row.meta_description || '',
  published: Boolean(row.is_published),
});

const META_COLUMNS =
  'id, slug, title, published_at, topic, excerpt, depth, tint, tags, meta_title, meta_description, is_published';

/** `a, b ,c` -> ['a','b','c']. Tags are stored as one string because that is what the form sends. */
export function splitTags(value) {
  return String(value ?? '')
    .split(',')
    .map(tag => tag.trim().replace(/^#/, ''))
    .filter(Boolean)
    .slice(0, 12);
}

/** The form's single string form, so tags round-trip through the editor unchanged. Accepts either
    the array a read produced or the string a form submitted. */
export const joinTags = list => splitTags(Array.isArray(list) ? list.join(',') : list).join(', ');

/* Columns added after the first release. `CREATE TABLE IF NOT EXISTS` does nothing to a table that
   already exists, so the migration runner checks information_schema and alters what is missing.
   The spec is data, so it can be tested without a database. */
export const POST_COLUMN_ADDITIONS = [
  { name: 'tags', ddl: "ADD COLUMN tags VARCHAR(200) NOT NULL DEFAULT '' AFTER tint" },
  { name: 'meta_title', ddl: "ADD COLUMN meta_title VARCHAR(200) NOT NULL DEFAULT '' AFTER tags" },
  { name: 'meta_description', ddl: "ADD COLUMN meta_description VARCHAR(400) NOT NULL DEFAULT '' AFTER meta_title" },
];

/** The additions a table with these column names is still missing. */
export function missingPostColumns(existing) {
  const have = new Set(existing || []);
  return POST_COLUMN_ADDITIONS.filter(column => !have.has(column.name));
}

/** Add any missing post columns. Safe to run on every start: it only ever adds. */
export async function ensurePostColumns() {
  const [rows] = await pool.query(
    `SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'posts'`,
  );
  const missing = missingPostColumns(rows.map(row => row.name));
  for (const column of missing) {
    await pool.query(`ALTER TABLE posts ${column.ddl}`);
  }
  return missing.map(column => column.name);
}

/** Published posts, newest first. Bodies are not included: the pond only needs the metadata. */
export async function listPosts() {
  const [rows] = await pool.query(
    `SELECT ${META_COLUMNS} FROM posts WHERE is_published = 1 ORDER BY published_at DESC, id DESC`,
  );
  return rows.map(toPost);
}

/** Every post including drafts, for the admin list. */
export async function listAllPosts() {
  const [rows] = await pool.query(
    `SELECT ${META_COLUMNS} FROM posts ORDER BY published_at DESC, id DESC`,
  );
  return rows.map(toPost);
}

export async function getPostBySlug(slug, { includeDrafts = false } = {}) {
  const [rows] = await pool.query(
    `SELECT ${META_COLUMNS}, body_md FROM posts WHERE slug = ? ${includeDrafts ? '' : 'AND is_published = 1'} LIMIT 1`,
    [slug],
  );
  if (!rows.length) return null;
  return { ...toPost(rows[0]), body: parseBody(rows[0].body_md) };
}

export async function getPostById(id) {
  const [rows] = await pool.query('SELECT * FROM posts WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

/** One post by id, parsed and including drafts: what the admin's preview renders. */
export async function getPostForPreview(id) {
  const [rows] = await pool.query(
    `SELECT ${META_COLUMNS}, body_md FROM posts WHERE id = ? LIMIT 1`,
    [id],
  );
  if (!rows.length) return null;
  return { ...toPost(rows[0]), body: parseBody(rows[0].body_md) };
}

export async function getPostRawBySlug(slug) {
  const [rows] = await pool.query('SELECT * FROM posts WHERE slug = ? LIMIT 1', [slug]);
  return rows[0] || null;
}

/** Insert or update by id. The caller guarantees the slug is free (see uniqueSlug in server.js);
 *  a plain INSERT means a slug clash raises ER_DUP_ENTRY instead of silently overwriting a post. */
export async function savePost({ id, slug, title, date, topic, excerpt, body, depth, tint, published, tags, metaTitle, metaDescription }) {
  const params = [
    slug, title, date, topic, excerpt, body,
    depth === '' || depth === null || depth === undefined ? null : Number(depth),
    tint || null,
    joinTags(tags || []),
    String(metaTitle ?? '').slice(0, 200),
    String(metaDescription ?? '').slice(0, 400),
    published ? 1 : 0,
  ];
  if (id) {
    await pool.query(
      `UPDATE posts SET slug=?, title=?, published_at=?, topic=?, excerpt=?, body_md=?, depth=?, tint=?,
        tags=?, meta_title=?, meta_description=?, is_published=?
       WHERE id=?`,
      [...params, id],
    );
    return Number(id);
  }
  const [res] = await pool.query(
    `INSERT INTO posts (slug, title, published_at, topic, excerpt, body_md, depth, tint, tags, meta_title, meta_description, is_published)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    params,
  );
  return res.insertId || 0;
}

export async function deletePost(id) {
  await pool.query('DELETE FROM posts WHERE id = ?', [id]);
}

export const BULK_ACTIONS = ['publish', 'unpublish', 'delete'];
export const BULK_MAX = 500;

/** A bulk request from the posts list: `{ action, ids }`, or `{ error }` with a sentence for the
 *  writer. Ids must be whole numbers; anything else is refused before it can reach SQL. */
export function parseBulkRequest(body) {
  const action = typeof body?.action === 'string' ? body.action : '';
  if (!BULK_ACTIONS.includes(action)) return { error: 'Choose an action: publish, move to drafts or delete.' };
  const raw = [].concat(body?.ids ?? []).map(value => String(value).trim()).filter(value => value !== '');
  const unique = [...new Set(raw)];
  if (!unique.length) return { error: 'Select at least one post first.' };
  if (unique.some(value => !/^\d+$/.test(value))) return { error: 'Those post ids are not valid.' };
  if (unique.length > BULK_MAX) return { error: `You can change at most ${BULK_MAX} posts at once.` };
  return { action, ids: unique.map(Number) };
}

/** Publish or move to drafts a set of posts in one statement. Returns the rows it touched. */
export async function setPublishedMany(ids, published) {
  const [res] = await pool.query('UPDATE posts SET is_published = ? WHERE id IN (?)', [published ? 1 : 0, ids]);
  return res.affectedRows;
}

/** Delete a set of posts in one statement. Returns the rows it removed. */
export async function deletePostsMany(ids) {
  const [res] = await pool.query('DELETE FROM posts WHERE id IN (?)', [ids]);
  return res.affectedRows;
}

export async function countPosts() {
  const [[row]] = await pool.query('SELECT COUNT(*) AS n FROM posts');
  return Number(row.n);
}
