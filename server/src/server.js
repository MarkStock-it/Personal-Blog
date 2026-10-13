/**
 * The blog server.
 *
 * Why this shape: the subdomain on this host is provisioned as a `portapp` vhost — Apache proxies
 * every request to 127.0.0.1:$PORT — so the app owns the whole URL space: pages, the admin area,
 * RSS and the sitemap. Posts and site copy live in MariaDB, so publishing needs no code change.
 *
 * Routes
 *   GET  /                home (the pond, from the database)
 *   GET  /post/:slug      a post            GET /about
 *   GET  /rss.xml         /sitemap.xml      /healthz
 *   GET  /admin           sign in / dashboard
 *   POST /admin/{login,logout,save,settings,delete/:id,bulk}
 */
import express from 'express';

import {
  getSettings, setSetting, SETTING_KEYS, settingsError,
  listPosts, listAllPosts, getPostBySlug, getPostById, getPostForPreview, savePost, deletePost,
  getPostRawBySlug, splitTags, pool,
  parseBulkRequest, setPublishedMany, deletePostsMany,
} from './db.js';
import { renderPage } from './render.js';
import { issueSession, readSession, verifyLogin } from './auth.js';
import { loginPage, dashboard, postForm, settingsPage } from './admin.js';
import { countPosts } from './db.js';

const PORT = Number(process.env.PORT || 20289);
const HOST = process.env.HOST || '127.0.0.1';        // the vhost proxies from localhost
const SESSION_SECRET = process.env.SESSION_SECRET || '';
const ADMIN_HASH = process.env.ADMIN_PASSWORD_HASH || '';
const ADMIN_USERNAME = (process.env.ADMIN_USERNAME || 'markelysalinas').trim();
const SITE_URL = (process.env.SITE_URL || '').replace(/\/+$/, '');
const COOKIE = 'ely_session';
const TTL_MS = 12 * 60 * 60 * 1000;                  // 12 hours

const app = express();
app.set('trust proxy', 1);                            // Apache terminates TLS in front of us
app.disable('x-powered-by');
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

/* ---------- small helpers, no extra dependencies ---------- */

const esc = value =>
  String(value ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function cookies(req) {
  const out = {};
  const raw = req.headers.cookie;
  if (!raw) return out;
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* ignore */ }
  }
  return out;
}

const isSignedIn = req => readSession(SESSION_SECRET, cookies(req)[COOKIE] || '').ok;

/* Mutations must come from this site. The session cookie is SameSite=Lax as well, so a cross-site
   form post carries no session in the first place; this is the second lock on the same door. */
function sameOrigin(req) {
  const origin = req.get('origin');
  if (!origin) return true;                          // same-origin form posts may omit Origin
  try { return new URL(origin).host === req.get('host'); } catch { return false; }
}

const baseUrl = req => SITE_URL || `${req.protocol}://${req.get('host')}`;

const slugify = value =>
  String(value || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120);

/* Never silently overwrite a different post that already owns the slug. */
async function uniqueSlug(desired, id) {
  let slug = desired || 'post';
  for (let n = 2; n < 200; n += 1) {
    const existing = await getPostRawBySlug(slug);
    if (!existing || String(existing.id) === String(id || '')) return slug;
    slug = `${desired}-${n}`;
  }
  throw new Error('could not find a free slug');
}

const today = () => new Date().toISOString().slice(0, 10);

/* The line shown after a bulk action. The query string comes from the browser, so only known keys
   count, and the number is clamped. */
const BULK_NOTICE = { published: 'published', unpublished: 'moved to drafts', deleted: 'deleted' };
function bulkNotice(query) {
  const word = typeof query.bulk === 'string' && Object.hasOwn(BULK_NOTICE, query.bulk) ? BULK_NOTICE[query.bulk] : '';
  if (!word) return '';
  const n = Math.max(0, Math.min(Number(query.n) || 0, 100000));
  return `${n} post${n === 1 ? '' : 's'} ${word}.`;
}

/* ---------- public pages ---------- */

app.get('/', async (req, res, next) => {
  try {
    const [settings, posts] = await Promise.all([getSettings(), listPosts()]);
    res.type('html').send(await renderPage({
      view: 'home', settings, posts, url: `${baseUrl(req)}/`,
    }));
  } catch (err) { next(err); }
});

app.get('/about', async (req, res, next) => {
  try {
    const [settings, posts] = await Promise.all([getSettings(), listPosts()]);
    res.type('html').send(await renderPage({
      view: 'about', settings, posts, url: `${baseUrl(req)}/about`,
    }));
  } catch (err) { next(err); }
});

app.get('/post/:slug', async (req, res, next) => {
  try {
    const [settings, posts, post] = await Promise.all([
      getSettings(), listPosts(), getPostBySlug(req.params.slug),
    ]);
    if (!post) return notFound(req, res, settings, posts);
    res.type('html').send(await renderPage({
      view: 'post', settings, posts, post, url: `${baseUrl(req)}/post/${post.slug}`,
    }));
  } catch (err) { next(err); }
});

app.get('/rss.xml', async (req, res, next) => {
  try {
    const [settings, posts] = await Promise.all([getSettings(), listPosts()]);
    const base = baseUrl(req);
    const items = posts.map(p => `    <item>
      <title>${esc(p.title)}</title>
      <link>${base}/post/${encodeURIComponent(p.slug)}</link>
      <guid isPermaLink="true">${base}/post/${encodeURIComponent(p.slug)}</guid>
      <pubDate>${new Date(`${p.date}T00:00:00Z`).toUTCString()}</pubDate>
      <description>${esc(p.excerpt)}</description>
    </item>`).join('\n');
    res.type('application/rss+xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
    <title>${esc(settings.name)}</title>
    <link>${base}/</link>
    <description>${esc(settings.description)}</description>
    <language>en</language>
${items}
</channel></rss>
`);
  } catch (err) { next(err); }
});

/* Keep the way in out of search engines. The admin pages carry a noindex meta tag as well. */
app.get('/robots.txt', (req, res) => {
  res.type('text/plain')
    .send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /login\n\nSitemap: ${baseUrl(req)}/sitemap.xml\n`);
});

app.get('/sitemap.xml', async (req, res, next) => {
  try {
    const [settings, posts] = await Promise.all([getSettings(), listPosts()]);
    const base = baseUrl(req);
    const urls = [
      `<url><loc>${base}/</loc></url>`,
      `<url><loc>${base}/about</loc></url>`,
      ...posts.map(p => `<url><loc>${base}/post/${encodeURIComponent(p.slug)}</loc>
    <lastmod>${p.date}</lastmod></url>`),
    ].join('\n  ');
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${urls}
</urlset>
`);
  } catch (err) { next(err); }
});

/* Readiness probe: proves the process is up *and* the database answers. */
app.get('/healthz', async (req, res) => {
  try {
    const [[row]] = await pool.query('SELECT 1 AS ok');
    const posts = await countPosts();
    res.json({ ok: row.ok === 1, posts, signedIn: isSignedIn(req) });
  } catch (err) {
    res.status(503).json({ ok: false, error: err.code || 'db_error' });
  }
});

/* ---------- admin ---------- */

const attempts = new Map();                            // ip -> { n, until }
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_MAX = 8;

function tooManyAttempts(ip) {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || now > entry.until) return false;
  return entry.n >= LOGIN_MAX;
}

function noteAttempt(ip, failed) {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (failed) {
    if (!entry || now > entry.until) attempts.set(ip, { n: 1, until: now + LOGIN_WINDOW_MS });
    else entry.n += 1;
  } else if (entry) {
    attempts.delete(ip);
  }
}

const requireSignIn = (req, res, next) => {
  if (isSignedIn(req)) return next();
  return res.status(401).type('html').send(loginPage({
    settings: { name: 'Admin' }, error: 'Please sign in to continue.', next: req.originalUrl,
  }));
};

app.get('/admin', async (req, res, next) => {
  try {
    const settings = await getSettings();
    if (!isSignedIn(req)) return res.type('html').send(loginPage({ settings }));
    const posts = await listAllPosts();
    const message = typeof req.query.saved === 'string'
      ? (req.query.saved === 'post' ? 'Post saved.' : req.query.saved === 'settings' ? 'Site details saved.' : '')
      : bulkNotice(req.query);
    const error = typeof req.query.bulkError === 'string' ? req.query.bulkError.slice(0, 200) : '';
    res.type('html').send(dashboard({ settings, posts, message, error }));
  } catch (err) { next(err); }
});

/* Only ever redirect to a path on this site. `//evil.example` is a protocol-relative URL, so it
   would otherwise turn the login form into an open redirect. */
const safeNext = value =>
  (typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')) ? value : '/admin';

const showLogin = async (req, res, next) => {
  try {
    const settings = await getSettings();
    const wants = safeNext(req.query.next);
    if (isSignedIn(req)) return res.redirect(wants);
    res.type('html').send(loginPage({ settings, next: wants }));
  } catch (err) { next(err); }
};

const doLogin = async (req, res, next) => {
  try {
    const settings = await getSettings();
    const ip = req.ip || 'unknown';
    const wants = safeNext(req.body.next);
    const username = String(req.body.username || '');
    if (!sameOrigin(req)) return res.status(403).send('Cross-origin request refused.');
    if (tooManyAttempts(ip)) {
      return res.status(429).type('html').send(loginPage({
        settings, error: 'Too many attempts. Try again in a few minutes.', next: wants, username,
      }));
    }
    if (!verifyLogin(username, req.body.password, ADMIN_USERNAME, ADMIN_HASH)) {
      noteAttempt(ip, true);
      return res.status(401).type('html').send(loginPage({
        settings, error: 'That username or password is not right.', next: wants, username,
      }));
    }
    noteAttempt(ip, false);
    res.cookie(COOKIE, issueSession(SESSION_SECRET, TTL_MS), {
      httpOnly: true, sameSite: 'lax', secure: req.secure, path: '/', maxAge: TTL_MS,
    });
    res.redirect(wants);
  } catch (err) { next(err); }
};

/* `/login` is the way in; `/admin/login` stays as an alias so an existing link keeps working. */
app.get('/login', showLogin);
app.get('/admin/login', showLogin);
app.post('/login', doLogin);
app.post('/admin/login', doLogin);

app.post('/admin/logout', (req, res) => {
  if (!sameOrigin(req)) return res.status(403).send('Cross-origin request refused.');
  res.clearCookie(COOKIE, { path: '/' });
  res.redirect('/admin');
});

app.get('/admin/settings', requireSignIn, async (req, res, next) => {
  try {
    const settings = await getSettings();
    res.type('html').send(settingsPage({
      settings,
      message: req.query.saved === '1' ? 'Site details saved. They are live now.' : '',
    }));
  } catch (err) { next(err); }
});

app.get('/admin/new', requireSignIn, async (req, res, next) => {
  try {
    const settings = await getSettings();
    res.type('html').send(postForm({
      settings, isNew: true,
      post: {
        id: '', title: '', slug: '', date: today(), topic: 'Essays', excerpt: '', body_md: '',
        depth: '', tint: '', tags: '', metaTitle: '', metaDescription: '', published: true,
      },
      topics: await knownTopics(),
    }));
  } catch (err) { next(err); }
});

app.get('/admin/edit/:id', requireSignIn, async (req, res, next) => {
  try {
    const settings = await getSettings();
    const post = await getPostById(Number(req.params.id));
    if (!post) return notFound(req, res, settings, await listPosts());
    res.type('html').send(postForm({
      settings, isNew: false,
      topics: await knownTopics(),
      post: {
        ...post,
        tags: post.tags || '',
        metaTitle: post.meta_title || '',
        metaDescription: post.meta_description || '',
        published: Boolean(post.is_published),
      },
      message: typeof req.query.saved === 'string' ? 'Saved.' : '',
    }));
  } catch (err) { next(err); }
});

/* Preview any post, published or not, exactly as the design renders it. A draft's own URL is a 404
   for everyone else, so this is the only way to read it before publishing. */
app.get('/admin/preview/:id', requireSignIn, async (req, res, next) => {
  try {
    const [settings, posts, post] = await Promise.all([
      getSettings(), listPosts(), getPostForPreview(Number(req.params.id)),
    ]);
    if (!post) return notFound(req, res, settings, posts);
    const html = await renderPage({
      view: 'post', settings, posts, post, url: `${baseUrl(req)}/admin/preview/${post.id}`,
    });
    res.type('html').send(withPreviewChrome(html, post));
  } catch (err) { next(err); }
});

app.post('/admin/save', requireSignIn, async (req, res, next) => {
  try {
    const settings = await getSettings();
    if (!sameOrigin(req)) return res.status(403).send('Cross-origin request refused.');

    const id = req.body.id ? Number(req.body.id) : null;
    const submitted = {
      id: id || '',
      title: String(req.body.title || '').trim().slice(0, 200),
      slug: slugify(req.body.slug || '') || slugify(req.body.title || '') || 'post',
      date: String(req.body.date || '').slice(0, 10) || today(),
      topic: String(req.body.topic || '').trim().slice(0, 60) || 'Essays',
      excerpt: String(req.body.excerpt || '').trim().slice(0, 400),
      body_md: String(req.body.body || ''),
      depth: String(req.body.depth ?? '').trim(),
      tint: String(req.body.tint || '').trim(),
      tags: splitTags(req.body.tags || '').join(', '),
      metaTitle: String(req.body.metaTitle || '').trim().slice(0, 200),
      metaDescription: String(req.body.metaDescription || '').trim().slice(0, 400),
      published: req.body.published ? true : false,
    };

    const fail = error => res.status(400).type('html').send(
      postForm({ settings, post: submitted, isNew: !id, error }));

    if (!submitted.title) return fail('A title is required.');
    if (!submitted.body_md.trim()) return fail('The body cannot be empty.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(submitted.date)) return fail('The date must look like 2026-10-11.');
    if (submitted.tint && !/^#[0-9a-fA-F]{6}$/.test(submitted.tint)) return fail('A tint must be a hex colour such as #C9D3F7.');
    if (submitted.depth !== '' && (Number.isNaN(Number(submitted.depth)) || Number(submitted.depth) < 0 || Number(submitted.depth) > 1)) {
      return fail('Depth must be between 0 and 1, or blank to let the page choose.');
    }

    submitted.slug = await uniqueSlug(submitted.slug, id);
    const savedId = await savePost({ ...submitted, body: submitted.body_md });
    res.redirect(savedId ? `/admin/edit/${savedId}?saved=1` : '/admin?saved=post');
  } catch (err) {
    if (err && err.code === 'ER_DUP_ENTRY') {
      const settings = await getSettings();
      return res.status(400).type('html').send(postForm({
        settings, isNew: !req.body.id,
        post: { ...req.body, slug: req.body.slug, body_md: req.body.body, published: Boolean(req.body.published) },
        error: 'Another post already uses that URL slug. Pick a different one.',
      }));
    }
    next(err);
  }
});

app.post('/admin/delete/:id', requireSignIn, async (req, res, next) => {
  try {
    if (!sameOrigin(req)) return res.status(403).send('Cross-origin request refused.');
    await deletePost(Number(req.params.id));
    res.redirect('/admin');
  } catch (err) { next(err); }
});

/* Publish, move to drafts or delete several posts from the list at once. The ids are checked by
   parseBulkRequest before they reach SQL, and each action is one statement. */
app.post('/admin/bulk', requireSignIn, async (req, res, next) => {
  try {
    if (!sameOrigin(req)) return res.status(403).send('Cross-origin request refused.');
    const request = parseBulkRequest(req.body);
    if (request.error) return res.redirect(`/admin?bulkError=${encodeURIComponent(request.error)}`);
    const changed = request.action === 'delete'
      ? await deletePostsMany(request.ids)
      : await setPublishedMany(request.ids, request.action === 'publish');
    const key = { publish: 'published', unpublish: 'unpublished', delete: 'deleted' }[request.action];
    res.redirect(`/admin?bulk=${key}&n=${changed}`);
  } catch (err) { next(err); }
});

app.post('/admin/settings', requireSignIn, async (req, res, next) => {
  try {
    if (!sameOrigin(req)) return res.status(403).send('Cross-origin request refused.');
    const submitted = {};
    for (const key of SETTING_KEYS) {
      if (typeof req.body[key] === 'string') submitted[key] = req.body[key].slice(0, 20000);
    }
    /* All or nothing. The form marks these required, but a form is only a suggestion: writing a
       blank one through would blank the nav and the title of the live site. */
    const error = settingsError(submitted);
    if (error) {
      const settings = await getSettings();
      return res.status(400).type('html').send(
        settingsPage({ settings: { ...settings, ...submitted }, error }));
    }
    for (const [key, value] of Object.entries(submitted)) await setSetting(key, value);
    res.redirect('/admin/settings?saved=1');
  } catch (err) { next(err); }
});

/* Topics already in use, so the topic box suggests your own words rather than a hardcoded list. */
async function knownTopics() {
  const posts = await listAllPosts();
  return [...new Set(posts.map(p => p.topic).filter(Boolean))].sort();
}

/* The design has no notion of a draft preview, so the preview chrome stays outside it: a noindex tag
   in the head and one fixed pill. Inline styles only, so nothing here can collide with the page's
   own stylesheet, and nothing is added to a public page. */
function withPreviewChrome(html, post) {
  const label = post.published ? 'Live post' : 'Draft — nobody else can see this';
  const banner = `<div role="status" style="position:fixed;left:1rem;bottom:1rem;z-index:9999;
      display:flex;gap:.6rem;align-items:center;padding:.5rem .8rem;border-radius:999px;
      background:#2B2742;color:#F7F5FB;font:500 13px/1.4 system-ui,-apple-system,Segoe UI,sans-serif;
      box-shadow:0 6px 24px #2b274240">
      <span>${esc(label)}</span>
      <a href="/admin/edit/${Number(post.id)}" style="color:#F6D9B8">Edit</a>
      <a href="/admin" style="color:#F6D9B8">All posts</a></div>`;
  return html
    .replace('<head>', '<head>\n<meta name="robots" content="noindex, nofollow">')
    .replace('<body data-view="home">', `<body data-view="home">\n${banner}`);
}

/* ---------- not found + errors ---------- */

async function notFound(req, res, settings, posts) {
  const html = await renderPage({
    view: 'notfound', settings, posts: posts || [], url: `${baseUrl(req)}${req.path}`,
  });
  res.status(404).type('html').send(html);
}

app.use(async (req, res) => {
  try {
    const [settings, posts] = await Promise.all([getSettings(), listPosts()]);
    await notFound(req, res, settings, posts);
  } catch {
    res.status(404).type('html').send('<!DOCTYPE html><title>Not found</title><h1>Not found</h1>');
  }
});

// eslint-disable-next-line no-unused-vars -- Express identifies error handlers by arity
app.use((err, req, res, next) => {
  console.error('[error]', err && err.stack ? err.stack : err);
  res.status(500).type('html').send(
    '<!DOCTYPE html><title>Something broke</title><h1>Something broke</h1><p>The error was logged.</p>');
});

/* ---------- start ---------- */

const server = app.listen(PORT, HOST, () => {
  console.log(`elyplog listening on http://${HOST}:${PORT}`);
  if (!SESSION_SECRET) console.warn('[warn] SESSION_SECRET is empty: nobody can sign in to /admin.');
  if (!ADMIN_HASH) console.warn('[warn] ADMIN_PASSWORD_HASH is empty: nobody can sign in at /login.');
});

const shutdown = signal => {
  console.log(`${signal} received, closing`);
  server.close(() => pool.end().then(() => process.exit(0)).catch(() => process.exit(0)));
  setTimeout(() => process.exit(0), 5000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export { app, server };
