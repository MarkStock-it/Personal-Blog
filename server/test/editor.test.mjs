/**
 * Tests for the admin screens and their live preview.
 *
 * The load-bearing test here is the parity check: the editor previews a post in the browser, and
 * that preview must not disagree with what the server will publish. `previewBlocks` is embedded
 * into the page as its own source, so these tests prove three things at once — that it agrees with
 * markdown.js, that the embedded copy is still valid JavaScript, and that the embedded copy gives
 * the same answer as the module it came from.
 *
 * Every screen is a pure function of its data, so the rest of this file is mostly "does it escape
 * what a writer typed".
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { loginPage, dashboard, postForm, settingsPage, previewBlocks } from '../src/admin.js';
import { parseBody } from '../src/markdown.js';
import { joinTags, splitTags, missingPostColumns, POST_COLUMN_ADDITIONS, pool } from '../src/db.js';
import { readFile } from 'node:fs/promises';

const settings = {
  name: 'Mark Ely Salinas',
  hero: 'Say the thing out loud.',
  lede: "I'm Mark Ely Salinas, a BSCS student passionate about voicing my personal views and insights.",
  description: 'A personal blog: essays and notes, written by hand.',
  aboutTitle: 'About',
  aboutDescription: 'Who writes here and why.',
  about: 'First para.\n\nNOTE: aside\n\n> quote',
  colophon: 'A personal blog built from my thoughts and experiences that are all written personally.',
  footer: 'Built with Node and MariaDB',
};

const post = {
  id: 7,
  slug: 'second-post',
  title: 'A shorter note on something smaller',
  date: '2026-09-15',
  topic: 'Notes',
  excerpt: 'Not every post needs to be long.',
  body_md: 'Opening paragraph.\n\nNOTE: a margin note\n\n> A pull quote',
  depth: 0.58,
  tint: '#C9D3F7',
  tags: 'design, ai',
  metaTitle: '',
  metaDescription: '',
  published: true,
};

/* A corpus wide enough that a rule change in one parser and not the other cannot pass unnoticed. */
const BODIES = [
  'one two\nthree\n\nsecond',
  'A paragraph.\n\nNOTE: a margin aside\n\n> A pull quote',
  '## A heading',
  '## A heading\ncontinues on the next line',
  'NOTE: orphan note',
  '> no space after the marker\n> second line',
  '',
  undefined,
  null,
  '\r\n\r\nafter some blank lines\r\n',
  '  leading and trailing spaces   \n\n  more  ',
  '<script>alert(1)</script> & "quotes" \'apostrophes\'',
  '**bold** *soft* `code` [x](https://example.com)',
  '[unsafe](javascript:alert(1)) and [safe](/post/one)',
  '[data](data:text/html,<script>)',
  'a & b < c > d',
  '**<b>escaped first</b>**',
  'emoji 🐟 and accents é — a dash',
  'NOTE: first\n\nNOTE: second attaches to nothing',
  'Para one\n\nNOTE: note on para one\n\n## After a note',
  '> quote\n\nNOTE: note after a quote',
  'text with __underscores__ and a * single star',
  'line1\nline2\nline3',
  '`code with **stars**` inside',
];

test('the editor preview parses a body exactly like the server parser', () => {
  for (const body of BODIES) {
    assert.deepEqual(previewBlocks(body), parseBody(body), `body: ${JSON.stringify(body)}`);
  }
});

/** Pull the embedded function source out of the rendered editor page, by matching braces. */
function embeddedPreviewSource(html) {
  const marker = 'var previewBlocks = ';
  const start = html.indexOf(marker);
  assert.ok(start > -1, 'the editor embeds the preview function');
  const body = html.slice(start + marker.length);
  let depth = 0;
  let started = false;
  for (let i = 0; i < body.length; i += 1) {
    if (body[i] === '{') { depth += 1; started = true; }
    else if (body[i] === '}') {
      depth -= 1;
      if (started && depth === 0) return body.slice(0, i + 1);
    }
  }
  throw new Error('could not find the end of the embedded preview function');
}

test('the copy embedded in the page is valid JavaScript and matches the module', () => {
  const html = postForm({ settings, post, topics: ['Notes'], isNew: false });
  const source = embeddedPreviewSource(html);
  // eslint-disable-next-line no-new-func -- the point of the test is that this source is runnable
  const fromPage = new Function(`return (${source})`)();
  assert.equal(typeof fromPage, 'function');
  for (const body of BODIES) {
    assert.deepEqual(fromPage(body), previewBlocks(body), `body: ${JSON.stringify(body)}`);
  }
});

test('a writer cannot inject markup through any post field', () => {
  const nasty = '<script>alert(1)</script>"><img src=x onerror=alert(1)>';
  const html = postForm({
    settings, isNew: false, topics: [nasty],
    post: { ...post, title: nasty, slug: 'x', excerpt: nasty, topic: nasty, tags: nasty, metaTitle: nasty, metaDescription: nasty },
  });
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(!html.includes('<img'), 'no raw tag survives');
  assert.ok(html.includes('&lt;script&gt;'));
  // The delete confirmation lives in an attribute, so a quote must not be able to close it early.
  const confirm = html.match(/data-confirm="([^"]*)"/);
  assert.ok(confirm, 'the delete confirmation is present');
  assert.ok(!confirm[1].includes('<') && !confirm[1].includes('"'),
    'the confirmation text stays inside its attribute');
});

test('the dashboard escapes titles and offers search, filters and stats', () => {
  const html = dashboard({
    settings,
    posts: [
      { ...post, id: 1, title: '<b>bold</b> title', published: true, tags: ['design'] },
      { ...post, id: 2, title: 'A draft', published: false, tags: [], excerpt: '' },
    ],
  });
  assert.ok(!html.includes('<b>bold</b> title'));
  assert.ok(html.includes('&lt;b&gt;bold&lt;/b&gt; title'));
  assert.ok(html.includes('id="q"'), 'search box');
  assert.ok(html.includes('id="state"') && html.includes('id="topic"') && html.includes('id="sort"'));
  assert.ok(html.includes('>1</b><span>published') && html.includes('>1</b><span>drafts'));
  assert.ok(html.includes('data-state="draft"') && html.includes('data-state="live"'));
  assert.ok(html.includes('/admin/preview/2'), 'a draft can be previewed');
});

test('the editor shows a preview, the new fields and the save shortcut', () => {
  const html = postForm({ settings, post, topics: ['Notes', 'Essays'], isNew: false });
  for (const name of ['title', 'slug', 'date', 'topic', 'excerpt', 'body', 'depth', 'tint',
    'tags', 'metaTitle', 'metaDescription', 'published']) {
    assert.ok(html.includes(`name="${name}"`), `field ${name} is missing`);
  }
  assert.ok(html.includes('id="pv-body"'), 'live preview pane');
  assert.ok(html.includes('id="tag-chips"'), 'tag chips');
  assert.ok(html.includes('id="tags-value"') && html.includes('value="design, ai"'),
    'tags survive a round trip through the hidden field');
  assert.ok(html.includes('metaKey'), 'Cmd/Ctrl+S');
  assert.ok(html.includes('beforeunload'), 'unsaved work guard');
  assert.ok(html.includes('<option value="Notes">') && html.includes('<option value="Essays">'),
    'topics come from the posts that exist');
  assert.ok(html.includes('/admin/preview/7'), 'a saved post can be previewed');
});

test('a new post shows no delete form and no preview link', () => {
  const html = postForm({
    settings, isNew: true, topics: [],
    post: { id: '', title: '', slug: '', date: '2026-10-12', topic: 'Essays', excerpt: '', body_md: '', depth: '', tint: '', tags: '', metaTitle: '', metaDescription: '', published: true },
  });
  assert.ok(!html.includes('/admin/delete/'));
  assert.ok(!html.includes('/admin/preview/'));
});

test('site details renders every setting and marks the required ones', () => {
  const html = settingsPage({ settings });
  for (const key of ['name', 'hero', 'lede', 'description', 'aboutTitle', 'aboutDescription', 'about', 'colophon', 'footer']) {
    assert.ok(html.includes(`name="${key}"`), `setting ${key} is missing`);
  }
  assert.ok(/name="name"[^>]*required/.test(html));
  assert.ok(/name="hero"[^>]*required/.test(html));
  assert.ok(html.includes('<meta name="robots" content="noindex, nofollow">'), 'noindex');
});

test('the sign-in page asks for both a username and a password', () => {
  const html = loginPage({ settings, error: 'That username or password is not right.' });
  assert.ok(html.includes('name="username"') && html.includes('name="password"'));
  assert.ok(html.includes('autocomplete="current-password"'));
  assert.ok(html.includes('That username or password is not right.'));
});

test('tags round-trip between the form string and the list the page gets', () => {
  assert.deepEqual(splitTags('design, ai ,#school'), ['design', 'ai', 'school']);
  assert.deepEqual(splitTags(['design', 'ai']), ['design', 'ai']);
  assert.deepEqual(splitTags(''), []);
  assert.deepEqual(splitTags(undefined), []);
  assert.deepEqual(splitTags('a,,b'), ['a', 'b']);
  assert.equal(splitTags(new Array(20).fill('t').join(',')).length, 12, 'a flood of tags is capped');
  assert.equal(joinTags(['design', 'ai']), 'design, ai');
  assert.equal(joinTags('design, ai'), 'design, ai');
  assert.equal(joinTags([]), '');
  assert.equal(joinTags('#design'), 'design');
  // What a save writes is what a read returns, which is what keeps the field stable.
  assert.deepEqual(splitTags(joinTags('  ai , design  ')), ['ai', 'design']);
});

test('the migration adds exactly the columns a table is missing', () => {
  assert.deepEqual(missingPostColumns([]).map(c => c.name), ['tags', 'meta_title', 'meta_description']);
  assert.deepEqual(missingPostColumns(['tags', 'meta_title']).map(c => c.name), ['meta_description']);
  assert.deepEqual(missingPostColumns(['tags', 'meta_title', 'meta_description']), []);
  assert.deepEqual(missingPostColumns(undefined).length, POST_COLUMN_ADDITIONS.length);
});

test('schema.sql and the migration agree, so a fresh install matches an upgraded one', async () => {
  const schema = await readFile(new URL('../schema.sql', import.meta.url), 'utf8');
  for (const column of POST_COLUMN_ADDITIONS) {
    assert.ok(schema.includes(`${column.name} `) || schema.includes(`${column.name}\n`),
      `schema.sql is missing ${column.name}, so a new database would differ from an upgraded one`);
  }
  await pool.end();
});
