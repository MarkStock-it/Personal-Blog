/**
 * Tests for the page renderer: what the design file receives.
 *
 * The design renders the About page with `SETTINGS.about.map(...)`, the same block list it uses for
 * post bodies. Serving the stored Markdown string instead threw
 * `SETTINGS.about.map is not a function` inside render(), which aborted before the colophon and
 * left /about a blank page. These tests pin the shape the page needs and the shape the admin form
 * needs, because they are deliberately different.
 *
 * Run with: npm test   (node --test test/)
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { renderPage } from '../src/render.js';

const settings = {
  name: 'Mark Ely Salinas',
  hero: 'Say the thing out loud.',
  lede: 'One or two sentences about who you are and why you write.',
  description: 'A personal blog: essays and notes, written by hand.',
  aboutTitle: 'About',
  aboutDescription: 'Who writes here and why.',
  about: 'First paragraph.\n\nNOTE: a margin aside\n\n> A pull quote',
  colophon: 'A personal blog built from my thoughts and experiences that are all written personally.',
  footer: 'Built with Node and MariaDB',
};

const posts = [{
  id: 1, slug: 'second-post', title: 'A shorter note on something smaller', date: '2026-09-15',
  topic: 'Notes', excerpt: 'Not every post needs to be long.', depth: 0.58, tint: null, published: true,
}];

/** Render a page and pull the data blob the client reads, exactly as the browser does. */
const payload = async ({ view = 'about', over = {}, ...rest } = {}) => {
  const html = await renderPage({
    view, settings: { ...settings, ...over }, posts,
    url: 'https://elyplog.dcism.org/about', ...rest,
  });
  const match = html.match(/window\.__ELY__ = (\{[\s\S]*?\});<\/script>/);
  assert.ok(match, 'the page carries its data blob');
  return { html, json: match[1], data: JSON.parse(match[1]) };
};

test('the About page receives blocks, not the stored Markdown string', async () => {
  const { data } = await payload();
  assert.ok(Array.isArray(data.settings.about), 'about must be a list of blocks');
  assert.deepEqual(data.settings.about, [
    { p: 'First paragraph.', note: 'a margin aside' },
    { quote: 'A pull quote' },
  ]);
});

test('rendering does not mutate the settings the dashboard reads', async () => {
  const subject = { ...settings };
  await renderPage({
    view: 'about', settings: subject, posts, url: 'https://elyplog.dcism.org/about',
  });
  assert.equal(typeof subject.about, 'string');
  assert.equal(subject.about, settings.about);
});

test('a blank or missing About body is an empty list, never a crash', async () => {
  for (const value of ['', undefined, null]) {
    const { data } = await payload({ over: { about: value } });
    assert.deepEqual(data.settings.about, []);
  }
});

test('About body HTML is escaped before it reaches the page', async () => {
  const { data } = await payload({ over: { about: 'Hello <script>alert(1)</script> & "quotes"' } });
  assert.deepEqual(data.settings.about, [
    { p: 'Hello &lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;quotes&quot;' },
  ]);
});

test('the head carries the About title and the site name in the About view', async () => {
  const { html } = await payload();
  assert.ok(html.includes('<title>About — Mark Ely Salinas</title>'));
  assert.ok(html.includes('<meta name="description" content="Who writes here and why.">'));
});

test('the head escapes the site name', async () => {
  const { html } = await payload({ view: 'home', over: { name: 'Mark & "Ely"' } });
  assert.ok(html.includes('<title>Mark &amp; &quot;Ely&quot;</title>'));
});

test('a post can override its own browser title and description', async () => {
  const post = {
    ...posts[0], body: [{ p: 'Body.' }], metaTitle: 'A different tab title',
    metaDescription: 'What a search result should say.',
  };
  const { html } = await payload({ view: 'post', post, posts: [post] });
  assert.ok(html.includes('<title>A different tab title — Mark Ely Salinas</title>'));
  assert.ok(html.includes('content="What a search result should say."'));
});

test('an empty override falls back to the title and the excerpt', async () => {
  const post = { ...posts[0], body: [{ p: 'Body.' }], metaTitle: '', metaDescription: '' };
  const { html } = await payload({ view: 'post', post, posts: [post] });
  assert.ok(html.includes('<title>A shorter note on something smaller — Mark Ely Salinas</title>'));
  assert.ok(html.includes('content="Not every post needs to be long."'));
});

test('a post title cannot close the data script tag early', async () => {
  const nasty = [{ ...posts[0], title: 'Ends the script</script><script>alert(1)</script>' }];
  const { html, json, data } = await payload({ view: 'post', posts: nasty, post: null });
  assert.ok(!json.includes('<'), 'the JSON must carry no literal <, so it cannot close the tag');
  assert.ok(!html.includes('</script><script>'), 'and so cannot inject a script tag');
  assert.equal(data.posts[0].title, 'Ends the script</script><script>alert(1)</script>');
});
