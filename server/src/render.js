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
 * Which share card a page advertises: the post's own colour when that colour is one of the drawn
 * ones, otherwise the neutral card. Kept in step with tools/make-og.mjs, which names each file after
 * its colour, so a page can only ever point at a card that exists.
 */
export function ogCardName(tint) {
  const wanted = String(tint ?? '').trim().toLowerCase();
  return TINTS.some(t => t.toLowerCase() === wanted) ? wanted.replace('#', '') : 'default';
}

/**
 * @param {object} o
 * @param {'home'|'post'|'about'|'notfound'|'unsubscribed'} o.view
 * @param {object} o.settings
 * @param {Array}  o.posts     metadata only
 * @param {object|null} o.post full post (with body blocks) for a post view
 * @param {object} o.unsub     newsletter removal state, for the unsubscribe view only
 * @param {object} o.confirm   signup confirmation state, for the confirmed view only
 * @param {string} o.url       absolute canonical URL
 * @param {string} o.nonce     this response's CSP nonce, from res.locals.cspNonce, which the two
 *   inline scripts in page.html carry; the header security.js sets names the same value, so a page
 *   rendered without it has its scripts blocked rather than running unguarded.
 */
export async function renderPage({
  view, settings, posts, post = null, unsub = null, confirm = null, url, nonce,
}) {
  /* Loud, not silent. A page rendered without the nonce its own CSP header names still looks right
     and does nothing: every listener the page installed is in a blocked inline script, so the water
     stops moving, the admin search stops filtering and the editor stops previewing. A 500 in the log
     is a far better outcome than a page that looks fine and is dead. */
  if (!nonce) throw new Error('renderPage needs the response nonce (res.locals.cspNonce)');

  /* A post can override how it is titled and described in a browser tab, a search result and a
     share card. Empty means derive it, so a post that sets nothing behaves exactly as before. */
  const title =
    view === 'post' && post
      ? (post.metaTitle ? `${post.metaTitle} — ${settings.name}` : `${post.title} — ${settings.name}`)
    : view === 'about' ? `${settings.aboutTitle} — ${settings.name}`
    : view === 'unsubscribed' ? `Unsubscribe — ${settings.name}`
    : view === 'confirmed' ? `${confirm && confirm.state === 'done' ? 'Subscribed' : 'Confirm your subscription'} — ${settings.name}`
    : view === 'notfound' ? `Not found — ${settings.name}`
    : settings.name;

  const description =
    view === 'post' && post
      ? (post.metaDescription || post.excerpt || `${post.title}, by ${settings.name}`)
    : view === 'about' ? settings.aboutDescription
    : view === 'unsubscribed' ? 'Leave the newsletter.'
    : view === 'confirmed' ? 'Confirm your subscription to the newsletter.'
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
    unsub: view === 'unsubscribed' ? unsub : null,
    confirm: view === 'confirmed' ? confirm : null,
    tints: TINTS,
  };

  /* A page holding a one-time removal link, or the result of one, has no business in an index. */
  const robots = view === 'unsubscribed' || view === 'confirmed'
    ? '<meta name="robots" content="noindex">' : '';

  /* og:image has to be absolute, so it is built from the canonical URL's origin. The 404 and the
     unsubscribe page advertise nothing: one has no canonical shape, the other is noindex. */
  const origin = (() => { try { return new URL(url).origin; } catch { return ''; } })();
  const carded = view === 'home' || view === 'about' || (view === 'post' && post);
  const image = carded && origin ? `${origin}/og/${ogCardName(view === 'post' ? post.tint : null)}.png` : '';
  const imageAlt = view === 'post' && post ? `${post.title} — share card` : `${settings.name} — share card`;
  const ogTags = image
    ? `<meta property="og:image" content="${escapeHtml(image)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${escapeHtml(imageAlt)}">`
    : '';

  const html = await loadPage();
  return html
    .replaceAll('{{TITLE}}', escapeHtml(title))
    .replaceAll('{{DESCRIPTION}}', escapeHtml(description))
    .replaceAll('{{OG_TYPE}}', view === 'post' ? 'article' : 'website')
    .replaceAll('{{SITE_NAME}}', escapeHtml(settings.name))
    .replace('{{OG_IMAGE_TAGS}}', ogTags)
    .replace('{{ROBOTS}}', robots)
    .replaceAll('{{NONCE}}', escapeHtml(nonce))
    .replaceAll('{{CANONICAL}}', escapeHtml(url))
    /* JSON, not text: `<` is escaped so a post can never close this script tag early. */
    .replace('{{DATA}}', JSON.stringify(data).replace(/</g, '\\u003c'));
}
