/**
 * Fills server/src/page.html.
 *
 * The design file is kept as-is and only its data, site copy and links are substituted, so the
 * water surface, the depth system and the typography are exactly the ones that were verified.
 * `{{DATA}}` is JSON for the client; everything else is HTML-escaped text for the head and nav,
 * which means a crawler sees the real title and description without running any script.
 */
import { readFile } from 'node:fs/promises';

import { parseBody } from './markdown.js';

const PAGE = new URL('./page.html', import.meta.url);
let cached = null;

export async function loadPage() {
  if (cached === null) cached = await readFile(PAGE, 'utf8');
  return cached;
}

const escapeHtml = value =>
  String(value ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* The tints the page uses when a post has none of its own. Kept here as well so the data blob
   declares them; the page assigns them farthest-first so two posts never look alike. */
export const TINTS = ['#C9D3F7', '#F4C7D4', '#C5E0D0', '#F6D9B8', '#DCCDF0', '#F3E7B0'];

/**
 * @param {object} o
 * @param {'home'|'post'|'about'|'notfound'} o.view
 * @param {object} o.settings
 * @param {Array}  o.posts     metadata only
 * @param {object|null} o.post full post (with body blocks) for a post view
 * @param {string} o.url       absolute canonical URL
 */
export async function renderPage({ view, settings, posts, post = null, url }) {
  /* A post can override how it is titled and described in a browser tab, a search result and a
     share card. Empty means derive it, so a post that sets nothing behaves exactly as before. */
  const title =
    view === 'post' && post
      ? (post.metaTitle ? `${post.metaTitle} — ${settings.name}` : `${post.title} — ${settings.name}`)
    : view === 'about' ? `${settings.aboutTitle} — ${settings.name}`
    : view === 'notfound' ? `Not found — ${settings.name}`
    : settings.name;

  const description =
    view === 'post' && post
      ? (post.metaDescription || post.excerpt || `${post.title}, by ${settings.name}`)
    : view === 'about' ? settings.aboutDescription
    : settings.description;

  /* The design renders the About page with the same block list it uses for post bodies: it calls
     `SETTINGS.about.map`, so the page must receive blocks, not the stored Markdown string. Passing
     the string threw `SETTINGS.about.map is not a function` and left /about blank. Only the copy
     the page receives is structured — the admin form still edits the raw Markdown. */
  const settingsForPage = { ...settings, about: parseBody(settings.about) };

  const data = {
    view,
    settings: settingsForPage,
    posts,
    post: view === 'post' ? post : null,
    tints: TINTS,
  };

  const html = await loadPage();
  return html
    .replaceAll('{{TITLE}}', escapeHtml(title))
    .replaceAll('{{DESCRIPTION}}', escapeHtml(description))
    .replaceAll('{{OG_TYPE}}', view === 'post' ? 'article' : 'website')
    .replaceAll('{{SITE_NAME}}', escapeHtml(settings.name))
    .replaceAll('{{CANONICAL}}', escapeHtml(url))
    /* JSON, not text: `<` is escaped so a post can never close this script tag early. */
    .replace('{{DATA}}', JSON.stringify(data).replace(/</g, '\\u003c'));
}
