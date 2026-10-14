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
 *   POST /admin/{login,logout,save,settings,delete/:id,bulk}      POST /subscribe
 *   GET  /unsubscribe     asks first      POST /unsubscribe     does the removal
 *   GET  /confirm         asks first      POST /confirm         confirms the signup
 */
import express from 'express';
import { fileURLToPath } from 'node:url';

import {
  getSettings, setSetting, SETTING_KEYS, settingsError,
  listPosts, listAllPosts, getPostBySlug, getPostById, getPostForPreview, savePost, deletePost,
  getPostRawBySlug, splitTags, pool,
  parseBulkRequest, setPublishedMany, deletePostsMany,
  addPendingSubscriber, confirmSubscriber, isConfirmedSubscriber, removeSubscriber, normaliseEmail,
} from './db.js';
import { renderPage } from './render.js';
import { issueSession, readSession, verifyLogin } from './auth.js';
import { loginPage, dashboard, postForm, settingsPage } from './admin.js';
import { countPosts } from './db.js';
import { syncMailjetContact, removeMailjetContact } from './mailjet.js';
import { verifyUnsubscribeToken } from './unsubscribe.js';
import { confirmUrl, verifyConfirmToken, confirmationEmail } from './confirm.js';
import { sendMail } from './mail.js';
import { createLimiter, retryAfterSeconds } from './limit.js';
import { security, trustProxySetting } from './security.js';

const PORT = Number(process.env.PORT || 20289);
const HOST = process.env.HOST || '127.0.0.1';        // the vhost proxies from localhost
const SESSION_SECRET = process.env.SESSION_SECRET || '';
const ADMIN_HASH = process.env.ADMIN_PASSWORD_HASH || '';
const ADMIN_USERNAME = (process.env.ADMIN_USERNAME || 'markelysalinas').trim();
const SITE_URL = (process.env.SITE_URL || '').replace(/\/+$/, '');
const MAILJET_API_KEY = (process.env.MAILJET_API_KEY || '').trim();
const MAILJET_SECRET_KEY = (process.env.MAILJET_SECRET_KEY || '').trim();
const MAILJET_LIST_ID = (process.env.MAILJET_LIST_ID || '').trim();
const MAILJET_FROM = (process.env.MAILJET_FROM || '').trim();
const MAILJET_FROM_NAME = (process.env.MAILJET_FROM_NAME || '').trim();
const COOKIE = 'ely_session';
const TTL_MS = 12 * 60 * 60 * 1000;                  // 12 hours

/* Where req.ip comes from: see trustProxySetting. Behind Apache — which is the only thing that can
   reach this port, and which appends the real client address to X-Forwarded-For — one hop is
   trusted, so the rightmost entry is the truth and anything the client sent sits to its left and is
   ignored. Measured locally: with one trusted hop, a forged header that reaches the app *directly*
   is believed, which is why the send cap further down does not depend on any header. */
const TRUST_PROXY = trustProxySetting(process.env.TRUST_PROXY, HOST);

const app = express();
app.set('trust proxy', TRUST_PROXY);
app.disable('x-powered-by');
app.use(security);                                    // headers on every response, errors included
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

/* The writing room and the sign-in page are personal responses — unpublished drafts, and a page that
   sets a session cookie — so nothing between here and the browser may keep a copy of them. */
app.use(['/admin', '/login'], (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

/* Social share cards, drawn by tools/make-og.mjs and shipped as files (`npm run og` to redraw them).
   They are named after a colour and never change once drawn, so they are served immutable and for a
   year: a shared link keeps its card without a request, and a redraw gets a new file name. */
const OG_DIR = fileURLToPath(new URL('../public/og/', import.meta.url));
app.use('/og', express.static(OG_DIR, { maxAge: '365d', immutable: true, index: false }));

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

/* ---------- the nonce, and what gets written down ---------- */

/* Every HTML response carries the nonce the security middleware made for it (see security.js): the
   policy names that nonce instead of 'unsafe-inline', so a page rendered without it is a page whose
   own scripts are blocked. One accessor, so a new route cannot quietly forget it. */
const nonceOf = res => res.locals.cspNonce;

/* Failed sign-ins and refused attempts get written down: a secret being guessed at should leave a
   trace. The trace is itself capped, because the record of a flood must not be able to fill the disk
   — five lines a minute get through and the rest are dropped. */
const LOG_LINES_PER_MIN = createLimiter({ windowMs: 60 * 1000, max: 5 });
/* One line, always: an attempted username is attacker-controlled text, and a newline in it would let
   the attempt forge an entry of its own in the log. */
const oneLine = value =>
  String(value ?? '').replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
function report(kind, detail = '') {
  if (!LOG_LINES_PER_MIN.hit('log').allowed) return;
  const line = oneLine(detail);
  console.warn(`[security] ${kind}${line ? ` — ${line}` : ''}`);
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
      view: 'home', settings, posts, url: `${baseUrl(req)}/`, nonce: nonceOf(res),
    }));
  } catch (err) { next(err); }
});

app.get('/about', async (req, res, next) => {
  try {
    const [settings, posts] = await Promise.all([getSettings(), listPosts()]);
    res.type('html').send(await renderPage({
      view: 'about', settings, posts, url: `${baseUrl(req)}/about`, nonce: nonceOf(res),
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
      view: 'post', settings, posts, post, url: `${baseUrl(req)}/post/${post.slug}`, nonce: nonceOf(res),
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
    /* The code goes to the log, not to the caller: which database refused, and how, is not something
       a public probe needs to be told. */
    console.error('[healthz] database check failed:', err.code || err.message);
    res.status(503).json({ ok: false });
  }
});

/* ---------- newsletter ---------- */

/* Signing up is a request, not a subscription: the address is recorded unconfirmed and a link is
   mailed to it. The reply is the same whether the address is new, pending or already confirmed, so
   the form cannot be used to find out who is on the list.

   Only a confirmed address is pushed to Mailjet, and only by /confirm below, because the list a
   mail provider keeps has to be one people actually agreed to join.

   It is also the one public route that makes the server send a message to an address the caller
   chooses — the shape an abuse script wants, whether to fill somebody else's inbox or to burn the
   account's daily sending quota in a minute. Three things hold that back: a budget per IP, one
   message per address per window, and never mailing an address that is already confirmed. A
   throttled request still gets the normal reply, so the route says nothing about what it sent. */
const SIGNUP_WINDOW_MS = 10 * 60 * 1000;
const signupsPerIp = createLimiter({ windowMs: SIGNUP_WINDOW_MS, max: 5 });
const signupsPerAddress = createLimiter({ windowMs: 15 * 60 * 1000, max: 1 });
const ALMOST_THERE = 'Almost there — check your inbox and open the link to confirm.';

/* A ceiling on outbound confirmation mail for the whole process, which no request header can move.
   The per-IP budget rests on req.ip, and that is read from X-Forwarded-For, so it is only as
   trustworthy as the proxy in front of it; this one counts every message the process sends, so the
   worst a forged header can do is cost a legitimate visitor their message rather than let a script
   post unlimited mail. The default sits well under the Mailjet free plan's 200 a day. */
const MAIL_HOURLY_CAP = Math.max(1, Number(process.env.MAIL_HOURLY_CAP || 40) || 40);
const sendsPerHour = createLimiter({ windowMs: 60 * 60 * 1000, max: MAIL_HOURLY_CAP });
let capReported = false;

app.post('/subscribe', async (req, res, next) => {
  try {
    if (!sameOrigin(req)) return res.status(403).json({ ok: false, message: 'Cross-origin request refused.' });
    const ip = req.ip || 'unknown';
    const budget = signupsPerIp.hit(ip);
    if (!budget.allowed) {
      report('signup refused', ip);
      res.set('Retry-After', String(retryAfterSeconds(budget.retryAfterMs)));
      return res.status(429).json({
        ok: false, message: 'Too many signups from here just now. Please try again a little later.',
      });
    }
    const email = normaliseEmail(req.body.email);
    if (!email) return res.status(400).json({ ok: false, message: 'That does not look like an email address.' });
    await addPendingSubscriber(email);

    /* Already confirmed: nothing to do and nothing to send, so this form can never be aimed at a
       subscriber's inbox. */
    if (await isConfirmedSubscriber(email)) return res.json({ ok: true, message: ALMOST_THERE });
    /* A second signup inside the window: the first message is still sitting in that inbox. */
    if (!signupsPerAddress.hit(email).allowed) return res.json({ ok: true, message: ALMOST_THERE });

    /* The hard ceiling. The signup is still recorded — the address is real either way — but no more
       mail leaves the process until the hour is up. Reported once per window, not once per request,
       so a flood cannot fill the log as well. */
    const mailBudget = sendsPerHour.hit('all');
    if (mailBudget.n === 1) capReported = false;
    if (!mailBudget.allowed) {
      if (!capReported) {
        capReported = true;
        console.error(`[subscribe] hourly confirmation-mail cap of ${MAIL_HOURLY_CAP} reached: signups are still recorded, but not mailed`);
      }
      return res.json({ ok: true, message: ALMOST_THERE });
    }

    const settings = await getSettings();
    const url = confirmUrl(email, { siteUrl: baseUrl(req), secret: SESSION_SECRET });
    if (url) {
      const mail = confirmationEmail({ email, url, settings });
      await sendMail(
        { from: MAILJET_FROM, fromName: MAILJET_FROM_NAME || settings.name, to: email, ...mail },
        { apiKey: MAILJET_API_KEY, secretKey: MAILJET_SECRET_KEY },
      );
    } else {
      /* No SESSION_SECRET means no link can be signed, so no confirmation can ever arrive. */
      console.error('[subscribe] SESSION_SECRET is empty: no confirmation link can be minted');
    }
    res.json({ ok: true, message: ALMOST_THERE });
  } catch (err) { next(err); }
});

/* The two link routes change something only on POST, and their POSTs are budgeted per IP: a token is
   256 bits of HMAC so guessing is not the worry, but a loop of requests is work for the database and
   the Mailjet account either way. Generous enough that a person clicking twice never notices. */
const linkActionsPerIp = createLimiter({ windowMs: SIGNUP_WINDOW_MS, max: 30 });

function refuseLinkFlood(req, res) {
  const budget = linkActionsPerIp.hit(req.ip || 'unknown');
  if (budget.allowed) return false;
  report('link action refused', req.ip || 'unknown');
  res.set('Retry-After', String(retryAfterSeconds(budget.retryAfterMs)));
  res.status(429).type('html').send('Too many requests just now. Please try again in a few minutes.');
  return true;
}

/* Confirming, which is what actually joins the list. Like the unsubscribe route, GET only explains
   and POST acts, so a scanner that follows links in mail cannot subscribe anybody by itself. */
async function sendConfirm(req, res, state, email = '', token = '') {
  const [settings, posts] = await Promise.all([getSettings(), listPosts()]);
  const confirm = state === 'ask' ? { state, email, token } : { state };
  return noStore(res).status(state === 'invalid' ? 400 : 200).type('html').send(await renderPage({
    view: 'confirmed', settings, posts, confirm, url: `${baseUrl(req)}/confirm`, nonce: nonceOf(res),
  }));
}

app.get('/confirm', async (req, res, next) => {
  try {
    const email = normaliseEmail(req.query.e);
    const token = typeof req.query.t === 'string' ? req.query.t : '';
    if (!verifyConfirmToken(email, token, SESSION_SECRET)) return sendConfirm(req, res, 'invalid');
    return sendConfirm(req, res, 'ask', email, token);
  } catch (err) { next(err); }
});

app.post('/confirm', async (req, res, next) => {
  try {
    if (!sameOrigin(req)) return noStore(res).status(403).type('html').send('Cross-origin request refused.');
    if (refuseLinkFlood(req, res)) return;
    const email = normaliseEmail(req.body.e);
    const token = typeof req.body.t === 'string' ? req.body.t : '';
    if (!verifyConfirmToken(email, token, SESSION_SECRET)) return sendConfirm(req, res, 'invalid');
    const fresh = await confirmSubscriber(email);
    /* Mailjet last, and only for the run that changed the row: an address that left the list and
       later follows an old link must not be quietly put back on it. */
    if (fresh) {
      await syncMailjetContact(email, {
        apiKey: MAILJET_API_KEY, secretKey: MAILJET_SECRET_KEY, listId: MAILJET_LIST_ID,
      });
    }
    return sendConfirm(req, res, 'done');
  } catch (err) { next(err); }
});

/* Leaving the list, which the signup form promises. The link in a note is
   /unsubscribe?e=<address>&t=<hmac of the address> — the token is why a stranger cannot remove
   somebody else's address. GET only shows the question; POST removes, so a link scanner or a
   mailbox preview that follows the URL cannot unsubscribe anyone by itself.

   The address travels in the query string, so these two responses are never cached and never leak
   it onward in a Referer header. */
function noStore(res) {
  res.set('Cache-Control', 'no-store').set('Referrer-Policy', 'strict-origin-when-cross-origin');
  return res;
}

async function sendUnsubscribe(req, res, state, email = '', token = '') {
  const [settings, posts] = await Promise.all([getSettings(), listPosts()]);
  /* The address and the token go back to the page only for the one state that posts them again. */
  const unsub = state === 'confirm' ? { state, email, token } : { state };
  return noStore(res).status(state === 'invalid' ? 400 : 200).type('html').send(await renderPage({
    view: 'unsubscribed', settings, posts, unsub, url: `${baseUrl(req)}/unsubscribe`, nonce: nonceOf(res),
  }));
}

app.get('/unsubscribe', async (req, res, next) => {
  try {
    const email = normaliseEmail(req.query.e);
    const token = typeof req.query.t === 'string' ? req.query.t : '';
    if (!verifyUnsubscribeToken(email, token, SESSION_SECRET)) return sendUnsubscribe(req, res, 'invalid');
    return sendUnsubscribe(req, res, 'confirm', email, token);
  } catch (err) { next(err); }
});

app.post('/unsubscribe', async (req, res, next) => {
  try {
    if (!sameOrigin(req)) return noStore(res).status(403).type('html').send('Cross-origin request refused.');
    if (refuseLinkFlood(req, res)) return;
    const email = normaliseEmail(req.body.e);
    const token = typeof req.body.t === 'string' ? req.body.t : '';
    if (!verifyUnsubscribeToken(email, token, SESSION_SECRET)) return sendUnsubscribe(req, res, 'invalid');
    await removeSubscriber(email);
    /* Mailjet last: the local list is the source of truth, and a Mailjet failure must not leave
       the visitor still subscribed here. */
    await removeMailjetContact(email, {
      apiKey: MAILJET_API_KEY, secretKey: MAILJET_SECRET_KEY, listId: MAILJET_LIST_ID,
    });
    return sendUnsubscribe(req, res, 'removed');
  } catch (err) { next(err); }
});

/* ---------- admin ---------- */

/* The same limiter the signup route uses, which also gives it the sweeping the old Map here never
   had: an entry per address that ever failed a login used to stay in memory for the life of the
   process. Eight failures in ten minutes, and a correct sign-in clears the count. */
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_MAX = 8;
const loginAttempts = createLimiter({ windowMs: LOGIN_WINDOW_MS, max: LOGIN_MAX });

const requireSignIn = (req, res, next) => {
  if (isSignedIn(req)) return next();
  return res.status(401).type('html').send(loginPage({
    settings: { name: 'Admin' }, error: 'Please sign in to continue.', next: req.originalUrl,
    nonce: nonceOf(res),
  }));
};

app.get('/admin', async (req, res, next) => {
  try {
    const settings = await getSettings();
    if (!isSignedIn(req)) return res.type('html').send(loginPage({ settings, nonce: nonceOf(res) }));
    const posts = await listAllPosts();
    const message = typeof req.query.saved === 'string'
      ? (req.query.saved === 'post' ? 'Post saved.' : req.query.saved === 'settings' ? 'Site details saved.' : '')
      : bulkNotice(req.query);
    const error = typeof req.query.bulkError === 'string' ? req.query.bulkError.slice(0, 200) : '';
    res.type('html').send(dashboard({ settings, posts, message, error, nonce: nonceOf(res) }));
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
    res.type('html').send(loginPage({ settings, next: wants, nonce: nonceOf(res) }));
  } catch (err) { next(err); }
};

const doLogin = async (req, res, next) => {
  try {
    const settings = await getSettings();
    const ip = req.ip || 'unknown';
    const wants = safeNext(req.body.next);
    const username = String(req.body.username || '');
    if (!sameOrigin(req)) return res.status(403).send('Cross-origin request refused.');
    const failures = loginAttempts.check(ip);
    if (!failures.allowed) {
      report('sign-in refused', `${ip} — ${LOGIN_MAX} failures inside ten minutes`);
      res.set('Retry-After', String(retryAfterSeconds(failures.retryAfterMs)));
      return res.status(429).type('html').send(loginPage({
        settings, error: 'Too many attempts. Try again in a few minutes.', next: wants, username,
        nonce: nonceOf(res),
      }));
    }
    if (!verifyLogin(username, req.body.password, ADMIN_USERNAME, ADMIN_HASH)) {
      loginAttempts.hit(ip);
      report('failed sign-in', `${username} from ${ip}`);
      return res.status(401).type('html').send(loginPage({
        settings, error: 'That username or password is not right.', next: wants, username,
        nonce: nonceOf(res),
      }));
    }
    loginAttempts.clear(ip);
    report('signed in', ip);
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
      nonce: nonceOf(res),
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
      nonce: nonceOf(res),
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
      nonce: nonceOf(res),
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
      view: 'post', settings, posts, post, url: `${baseUrl(req)}/admin/preview/${post.id}`, nonce: nonceOf(res),
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
      postForm({ settings, post: submitted, isNew: !id, error, nonce: nonceOf(res) }));

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
        nonce: nonceOf(res),
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
        settingsPage({ settings: { ...settings, ...submitted }, error, nonce: nonceOf(res) }));
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
    view: 'notfound', settings, posts: posts || [], url: `${baseUrl(req)}${req.path}`, nonce: nonceOf(res),
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
