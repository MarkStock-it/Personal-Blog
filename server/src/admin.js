/**
 * Admin pages: the writing room.
 *
 * Why this shape: the blog is a quiet editorial page — paper, one accent, a display face for the
 * shout and a reading face for the prose. The admin keeps that identity instead of looking like
 * borrowed software, but it is deliberately plainer: this is a tool you use for ten minutes, so the
 * page is made of real form controls, not of the pond's motion and canvas. Same palette, same two
 * fonts, no client framework and no build step — every screen below is a string.
 *
 * Two rules this file must keep:
 *   - everything that came from a writer is escaped on the way out (see `esc`);
 *   - the live preview in the editor runs the SAME parser as the server. It is not a copy:
 *     `previewBlocks` below is a real function, embedded into the page as its own source, and
 *     test/editor.test.mjs asserts it returns byte-identical blocks to src/markdown.js. If the two
 *     ever drift, the test fails rather than the preview quietly lying.
 */

const esc = value =>
  String(value ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* The blog's own faces, so the admin and the site look like one thing. */
const FONTS = 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,200..800'
  + '&family=Literata:ital,opsz,wght@0,7..72,400;0,7..72,600;1,7..72,400&display=swap';

const CSS = `
:root{
  --paper:#F7F5FB; --card:#fff; --wash:#EFEBF8; --line:#E2DEF0; --field:#FBFAFE;
  --ink:#2B2742; --mut:#615C7D; --accent:#4F4CA8; --accent-soft:#DCD9F5;
  --good:#3F6B52; --bad:#8A2A45; --warn:#8A6320; --deep:#1E1B31;
  --display:"Bricolage Grotesque",ui-sans-serif,system-ui,sans-serif;
  --read:"Literata",Georgia,serif; --mono:ui-monospace,SFMono-Regular,Menlo,monospace;
  --r:12px; --r-sm:8px;
}
*{box-sizing:border-box}
[hidden]{display:none !important}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.65 var(--read);
  -webkit-font-smoothing:antialiased}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:underline}
h1,h2,h3,.label,nav,button,input,select,textarea,.bar,.pill{font-family:var(--display)}
h1{font-size:clamp(1.5rem,1rem + 1.6vw,2rem);line-height:1.15;letter-spacing:-.015em;margin:0}
h2{font-size:1.05rem;letter-spacing:.01em;margin:0}
h3{font-size:.9rem;letter-spacing:.02em;margin:0}
p{margin:0 0 .9rem}
.label{font-size:.75rem;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--mut)}
.mut{color:var(--mut)}
.small{font-size:.86rem}

/* ---- top bar: ink, so the tool never gets confused with the blog ---- */
.bar{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:1rem;
  justify-content:space-between;flex-wrap:wrap;padding:.7rem clamp(1rem,3vw,1.6rem);
  background:var(--deep);color:var(--paper)}
.bar a{color:var(--paper);text-decoration:none}
.bar a:hover{text-decoration:underline}
.brand{display:flex;align-items:baseline;gap:.6rem;font-weight:600;letter-spacing:-.01em}
.brand .tag{font-size:.75rem;letter-spacing:.14em;text-transform:uppercase;color:#B9B3D8}
.bar-actions{display:flex;align-items:center;gap:1rem;font-size:.9rem}
.bar form{margin:0}
.linkish{background:none;border:0;color:var(--paper);font:inherit;cursor:pointer;padding:0}
.linkish:hover{text-decoration:underline}

.shell{display:grid;grid-template-columns:13rem minmax(0,1fr);gap:clamp(1rem,3vw,2.4rem);
  max-width:82rem;margin:0 auto;padding:clamp(1.2rem,3vw,2.2rem) clamp(1rem,3vw,1.6rem) 5rem}
.side{display:flex;flex-direction:column;gap:.2rem;position:sticky;top:4.2rem;align-self:start}
.side a{display:block;padding:.5rem .7rem;border-radius:var(--r-sm);color:var(--ink);font-size:.95rem}
.side a:hover{background:var(--wash);text-decoration:none}
.side a[aria-current=page]{background:var(--ink);color:var(--paper)}
.side .side-head{margin:0 0 .5rem .7rem}
@media(max-width:58rem){
  .shell{grid-template-columns:1fr;gap:1.2rem}
  .side{position:static;flex-direction:row;overflow-x:auto;padding-bottom:.4rem}
}

.head{display:flex;align-items:flex-end;justify-content:space-between;gap:1rem;flex-wrap:wrap;
  margin-bottom:1.2rem;padding-bottom:1rem;border-bottom:1px solid var(--line)}
.head .sub{color:var(--mut);font-size:.9rem;margin:.3rem 0 0}

.card{background:var(--card);border:1px solid var(--line);border-radius:var(--r);
  padding:clamp(1rem,2.2vw,1.5rem);margin-bottom:1.2rem}
.card>h2{margin-bottom:.9rem}
.grid{display:grid;gap:1rem}
@media(min-width:46rem){.g2{grid-template-columns:1fr 1fr}.g3{grid-template-columns:repeat(3,1fr)}}

/* ---- stats ---- */
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(8.5rem,1fr));gap:.7rem;margin-bottom:1.2rem}
.stat{background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:.85rem 1rem}
.stat b{display:block;font-family:var(--display);font-size:1.5rem;line-height:1.1;letter-spacing:-.02em}
.stat span{font-size:.75rem;letter-spacing:.1em;text-transform:uppercase;color:var(--mut)}

/* ---- fields ---- */
label.field{display:block;margin:0 0 1rem}
label.field>span{display:flex;justify-content:space-between;align-items:baseline;gap:.6rem;
  font-size:.75rem;font-weight:600;letter-spacing:.11em;text-transform:uppercase;color:var(--mut);
  margin-bottom:.35rem}
label.field .count{font-weight:500;letter-spacing:.04em;text-transform:none;font-size:.75rem;color:var(--mut)}
label.field .count[data-warn=1]{color:var(--warn)}
.hint{margin:.35rem 0 0;font-size:.82rem;color:var(--mut)}
input,select,textarea{width:100%;padding:.6rem .7rem;border:1px solid var(--line);border-radius:var(--r-sm);
  background:var(--field);color:var(--ink);font-size:.95rem;font-family:var(--display)}
textarea{font-family:var(--mono);font-size:.9rem;line-height:1.6;min-height:20rem;resize:vertical;
  background:#fff}
input:focus,select:focus,textarea:focus{outline:2px solid var(--accent);outline-offset:1px;
  border-color:var(--accent)}
input::placeholder,textarea::placeholder{color:#9C96B8}
.row{display:flex;gap:.8rem;flex-wrap:wrap}
.row>*{flex:1 1 8rem;min-width:0}

button{font:inherit;font-family:var(--display);padding:.55rem 1rem;border-radius:var(--r-sm);
  border:1px solid var(--line);background:var(--card);color:var(--ink);cursor:pointer}
button:hover{background:var(--wash)}
button.primary{background:var(--accent);border-color:var(--accent);color:#fff}
button.primary:hover{background:#43419B}
button.ghost{background:transparent}
button.danger{color:var(--bad);border-color:#E7C6D1}
button.danger:hover{background:#FBEDF1}
button[disabled]{opacity:.5;cursor:not-allowed}
.btn-row{display:flex;gap:.6rem;align-items:center;flex-wrap:wrap;margin-top:1.2rem}

.check{display:inline-flex;align-items:center;gap:.5rem;font-size:.92rem;cursor:pointer;padding:.25rem 0}
.check input{width:auto;accent-color:var(--accent)}

/* ---- pills, chips, flashes ---- */
.pill{display:inline-block;font-size:.75rem;font-weight:600;letter-spacing:.1em;text-transform:uppercase;
  padding:.15rem .5rem;border-radius:999px;border:1px solid var(--line);color:var(--mut);background:var(--card)}
.pill.live{color:var(--good);border-color:#C6DCCE;background:#F2F8F4}
.pill.draft{color:var(--warn);border-color:#E6D6B8;background:#FBF6EC}
.chips{display:flex;flex-wrap:wrap;gap:.35rem;margin:.5rem 0 0}
.chip{display:inline-flex;align-items:center;gap:.35rem;font-family:var(--display);font-size:.78rem;
  padding:.2rem .5rem .2rem .6rem;border-radius:999px;background:var(--wash);border:1px solid var(--line)}
.chip button{border:0;background:none;padding:.2rem .3rem;color:var(--mut);cursor:pointer;font-size:.9rem;line-height:1;
  border-radius:var(--r-sm)}
.flash{display:flex;gap:.6rem;align-items:flex-start;border:1px solid var(--line);border-left:3px solid var(--accent);
  background:var(--card);border-radius:var(--r-sm);padding:.7rem .9rem;margin-bottom:1rem;font-size:.92rem}
.flash.ok{border-left-color:var(--good)}
.flash.bad{border-left-color:var(--bad);color:var(--bad)}

/* ---- post list ---- */
.toolbar{display:flex;gap:.6rem;flex-wrap:wrap;align-items:center;margin-bottom:1rem}
.toolbar input[type=search]{flex:1 1 14rem;background:var(--card)}
.toolbar select{flex:0 1 11rem;width:auto;background:var(--card)}
.list{display:flex;flex-direction:column;gap:.6rem;padding:0;margin:0;list-style:none}
/* Flex, not a two-column grid: with an auto-sized actions column, a grid let the button row
   squeeze the title to 0px wide on a phone, so the title took all the height and none of the
   width. Wrapping keeps the title its space and drops the buttons underneath when they do not fit. */
.item{display:flex;flex-wrap:wrap;gap:.7rem 1rem;align-items:flex-start;justify-content:space-between;
  background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:.9rem 1rem}
.item>div:first-of-type{flex:1 1 19rem;min-width:0}
/* A bare checkbox is an 18px target, which is small on a phone. The wrapper gives it a 2rem hit
   area without changing the box the eye sees; the offsets keep the box exactly where it was. */
.pickbox{flex:0 0 auto;display:flex;align-items:center;justify-content:center;width:2rem;height:2rem;
  margin:-.15rem 0 0 -.45rem;border-radius:var(--r-sm);cursor:pointer}
.pickbox:hover{background:var(--wash)}
.pick{width:1.1rem;height:1.1rem;margin:0;accent-color:var(--accent);cursor:pointer}
.bulk{display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;margin:0 0 .7rem;padding:.6rem .8rem;
  background:var(--card);border:1px solid var(--line);border-radius:var(--r-sm)}
.bulk .check{margin-right:.3rem}
.bulk button{font-size:.85rem;padding:.4rem .7rem}
.item .acts{flex:0 1 auto;margin-left:auto}
.item:hover{border-color:#CFC8E8}
.item h2{font-size:1.02rem;letter-spacing:-.01em}
.item h2 a{color:var(--ink)}
.item .meta{display:flex;gap:.7rem;flex-wrap:wrap;align-items:center;margin:.35rem 0 0;font-size:.82rem;color:var(--mut)}
.item .acts{display:flex;gap:.4rem;align-items:center;flex-wrap:wrap;justify-content:flex-end}
@media(max-width:34rem){.item .acts{justify-content:flex-start;margin-left:0}}
.item .acts a,.item .acts button{font-size:.82rem;padding:.34rem .6rem}
.item .chips{margin-top:.5rem}
.empty{padding:2rem 1rem;text-align:center;color:var(--mut);background:var(--card);
  border:1px dashed var(--line);border-radius:var(--r)}

/* ---- the editor's live preview: paper, like the blog ---- */
.editor{display:grid;gap:1.4rem;align-items:start}
@media(min-width:64rem){.editor{grid-template-columns:minmax(0,1.35fr) minmax(17rem,.85fr)}}
.rail{position:sticky;top:4.2rem;display:grid;gap:1rem}
.pv{background:#fff;border:1px solid var(--line);border-radius:var(--r);padding:1.1rem 1.2rem;
  box-shadow:0 1px 0 #fff inset}
.pv-title{font-family:var(--display);font-weight:600;font-size:1.3rem;line-height:1.2;
  letter-spacing:-.02em;margin:0 0 .4rem}
.pv-meta{font-size:.76rem;color:var(--mut);letter-spacing:.04em;margin:0 0 .8rem;
  font-family:var(--display)}
.pv-excerpt{font-style:italic;color:var(--mut);border-left:2px solid var(--accent-soft);
  padding-left:.7rem;margin:0 0 1rem;font-size:.92rem}
.pv-body{font-size:.98rem}
.pv-body .blk p{margin:0 0 .85rem}
.pv-body blockquote{margin:1rem 0;padding-left:.9rem;border-left:2px solid var(--accent);
  font-style:italic;color:var(--ink)}
.pv-body aside{display:block;margin:.5rem 0 1rem;padding:.5rem .7rem;background:var(--wash);
  border-radius:var(--r-sm);font-size:.86rem;color:var(--mut)}
.pv-body aside .label{display:block;margin-bottom:.15rem}
.pv-body code{background:var(--wash);padding:.05rem .3rem;border-radius:4px;font-family:var(--mono);
  font-size:.86em}
.pv-empty{color:var(--mut);font-size:.9rem;font-style:italic}
.meter{display:flex;align-items:center;gap:.6rem}
.meter input[type=range]{padding:0;background:none;border:0;accent-color:var(--accent)}
.meter output{font-family:var(--mono);font-size:.86rem;min-width:3.2rem;text-align:right}
.swatches{display:flex;gap:.4rem;flex-wrap:wrap;margin-top:.5rem}
.swatches button{width:1.9rem;height:1.9rem;padding:0;border-radius:50%;border:1px solid var(--line)}
.swatches button[aria-pressed=true]{outline:2px solid var(--accent);outline-offset:1px}
.keys{font-size:.8rem;color:var(--mut)}
kbd{font-family:var(--mono);font-size:.75rem;background:var(--wash);border:1px solid var(--line);
  border-radius:4px;padding:.05rem .3rem}
table.cheat{width:100%;border-collapse:collapse;font-size:.84rem}
table.cheat td{padding:.3rem .4rem;border-bottom:1px solid var(--line);vertical-align:top}
table.cheat td:first-child{font-family:var(--mono);color:var(--ink);white-space:nowrap;width:8rem}
.seo-preview{background:var(--card);border:1px solid var(--line);border-radius:var(--r-sm);padding:.7rem .8rem}
.seo-preview .u{font-size:.78rem;color:var(--good)}
.seo-preview .t{font-family:var(--display);color:#1a0dab;font-size:1rem;margin:.1rem 0}
.seo-preview .d{font-size:.84rem;color:var(--mut)}
details{border-top:1px solid var(--line);padding-top:.8rem;margin-top:.4rem}
summary{cursor:pointer;font-family:var(--display);font-size:.86rem;color:var(--mut)}
`;

/* ---------- small helpers ---------- */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** '2026-10-01' -> '1 Oct 2026'. Kept dumb on purpose: the date is already a string. */
function fmtDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!m) return String(value || '');
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

/** A tags value from the form (string) or the database (array) as a clean array. */
function tagList(value) {
  const raw = Array.isArray(value) ? value.join(',') : String(value || '');
  return raw.split(',').map(t => t.trim().replace(/^#/, '')).filter(Boolean).slice(0, 12);
}

/**
 * The editor's live preview blocks.
 *
 * A deliberately self-contained mirror of src/markdown.js: escape first, format second, blank line
 * between blocks, `> ` a pull quote, `NOTE: ` a margin note on the block above, `## ` a bold
 * heading, one newline a space. It is written without closures and without template literals so the
 * whole function can be embedded in the page as its own source — and test/editor.test.mjs asserts
 * it returns exactly what the server's parser returns for a corpus of bodies.
 */
export function previewBlocks(markdown) {
  const escapes = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const escapeHtml = value => String(value === null || value === undefined ? '' : value)
    .replace(/[&<>"']/g, c => escapes[c]);
  const safeUrl = /^(?:https?:\/\/|mailto:|\/)/i;
  const inline = text => {
    let out = escapeHtml(text);
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
    out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (whole, label, url) {
      return safeUrl.test(url)
        ? '<a href="' + url + '" rel="noopener noreferrer">' + label + '</a>'
        : whole;
    });
    return out;
  };
  const lines = chunk => chunk.split('\n').map(l => l.trim()).filter(l => l !== '');

  const blocks = [];
  const chunks = String(markdown === null || markdown === undefined ? '' : markdown)
    .replace(/\r\n?/g, '\n').split(/\n\s*\n+/);

  for (let i = 0; i < chunks.length; i += 1) {
    const body = lines(chunks[i]);
    if (!body.length) continue;
    const first = body[0];
    const rest = body.slice(1);

    if (first === '>' || first.indexOf('> ') === 0) {
      const text = body.map(l => (l === '>' ? '' : l.indexOf('> ') === 0 ? l.slice(2) : l)).join(' ');
      blocks.push({ quote: inline(text) });
      continue;
    }
    if (first.indexOf('NOTE: ') === 0) {
      const note = inline([first.slice(6)].concat(rest).join(' '));
      const previous = blocks[blocks.length - 1];
      if (previous && previous.p !== undefined && previous.note === undefined) previous.note = note;
      else blocks.push({ p: note });
      continue;
    }
    if (first.indexOf('## ') === 0) {
      blocks.push({ p: '<strong>' + inline([first.slice(3)].concat(rest).join(' ')) + '</strong>' });
      continue;
    }
    blocks.push({ p: inline(body.join(' ')) });
  }
  return blocks;
}

/* ---------- shell ---------- */

const NAV = [
  { id: 'posts', href: '/admin', label: 'All posts' },
  { id: 'new', href: '/admin/new', label: 'Write a post' },
  { id: 'settings', href: '/admin/settings', label: 'Site details' },
];

/* `nonce` is this response's CSP nonce (res.locals.cspNonce). The admin pages carry their behaviour in
   an inline script, and script-src names a nonce instead of 'unsafe-inline', so a page rendered
   without one is a page whose buttons do nothing. It is applied here, in the one place every admin
   page's script passes through, rather than inside each template, so a new script cannot be
   forgotten — an omission would be silent in exactly the way that is hard to notice. */
const layout = ({ title, settings, body, signedIn, nav = '', script = '', nonce = '' }) => `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)} — ${esc(settings.name)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<style>${CSS}</style>
</head><body>
<header class="bar">
  <span class="brand"><a href="/admin">${esc(settings.name)}</a><span class="tag">writing room</span></span>
  <nav class="bar-actions">
    <a href="/" target="_blank" rel="noopener">View site ↗</a>
    ${signedIn
      ? `<form method="post" action="/admin/logout"><button class="linkish" type="submit">Sign out</button></form>`
      : ''}
  </nav>
</header>
<div class="shell">
  ${signedIn
    ? `<nav class="side" aria-label="Admin">
        <span class="label side-head">Writing</span>
        ${NAV.map(item => `<a href="${item.href}"${item.id === nav ? ' aria-current="page"' : ''}>${item.label}</a>`).join('')}
      </nav>`
    : '<nav class="side" aria-label="Admin"><span class="label side-head">Sign in</span></nav>'}
  <main>${body}</main>
</div>
${script.replace(/^<script>/, `<script nonce="${esc(nonce)}">`)}
</body></html>`;

/* ---------- sign in ---------- */

export const loginPage = ({ settings, error = '', next = '/admin', username = '', nonce = '' }) =>
  layout({
    title: 'Sign in', settings, signedIn: false, nonce,
    body: `<div class="head"><div>
      <h1>Sign in</h1>
      <p class="sub">Your writing room. Everything you publish here is live immediately.</p>
    </div></div>
    ${error ? `<p class="flash bad">${esc(error)}</p>` : ''}
    <form method="post" action="/login" class="card" style="max-width:24rem">
      <input type="hidden" name="next" value="${esc(next)}">
      <label class="field"><span>Username</span>
        <input name="username" value="${esc(username)}" autocomplete="username" autocapitalize="none"
          autocorrect="off" spellcheck="false" autofocus required placeholder="your username"></label>
      <label class="field"><span>Password</span>
        <input name="password" type="password" autocomplete="current-password" required placeholder="••••••••"></label>
      <button class="primary" type="submit">Sign in</button>
    </form>
    <p class="hint">Only the owner can sign in. The username and the password hash live in
      <code>ADMIN_USERNAME</code> and <code>ADMIN_PASSWORD_HASH</code> on the server. To change the
      password: <code>npm run hash -- "new password"</code>, paste it into <code>.env</code>, restart.</p>`,
  });

/* ---------- all posts ---------- */

const STAT = (value, label) => `<div class="stat"><b>${esc(value)}</b><span>${esc(label)}</span></div>`;

export const dashboard = ({ settings, posts, message = '', error = '', nonce = '' }) => {
  const live = posts.filter(p => p.published).length;
  const drafts = posts.length - live;
  const topics = [...new Set(posts.map(p => p.topic).filter(Boolean))].sort();
  const tags = [...new Set(posts.flatMap(p => p.tags || []))].sort();
  const latest = posts.map(p => p.date).sort().slice(-1)[0];

  const row = p => `<li class="item" data-title="${esc(`${p.title} ${p.slug} ${p.topic} ${(p.tags || []).join(' ')} ${p.excerpt}`.toLowerCase())}"
      data-state="${p.published ? 'live' : 'draft'}" data-topic="${esc(p.topic)}">
    <label class="pickbox"><input class="pick" type="checkbox" form="bulk" name="ids" value="${Number(p.id)}" aria-label="Select ${esc(p.title)}"></label>
    <div>
      <h2><a href="/admin/edit/${Number(p.id)}">${esc(p.title)}</a></h2>
      <p class="meta">
        <span class="pill ${p.published ? 'live' : 'draft'}">${p.published ? 'live' : 'draft'}</span>
        <span>${esc(fmtDate(p.date))}</span>
        <span>·</span><span>${esc(p.topic)}</span>
        <span>·</span><span>/${esc(p.slug)}</span>
        <span>·</span><span class="mut">${esc(p.excerpt ? p.excerpt.slice(0, 60) : 'no excerpt')}</span>
      </p>
      ${(p.tags || []).length
        ? `<div class="chips">${p.tags.map(t => `<span class="chip">#${esc(t)}</span>`).join('')}</div>`
        : ''}
    </div>
    <div class="acts">
      <a href="/admin/edit/${Number(p.id)}"><button type="button">Edit</button></a>
      <a href="/admin/preview/${Number(p.id)}" target="_blank" rel="noopener"><button type="button" class="ghost">Preview</button></a>
      ${p.published ? `<a href="/post/${encodeURIComponent(p.slug)}" target="_blank" rel="noopener"><button type="button" class="ghost">View ↗</button></a>` : ''}
      <button type="button" class="ghost" data-copy="/post/${esc(p.slug)}">Copy link</button>
      <form method="post" action="/admin/delete/${Number(p.id)}" style="display:inline"
        data-confirm="Delete &quot;${esc(p.title)}&quot;? This cannot be undone.">
        <button class="danger" type="submit">Delete</button>
      </form>
    </div>
  </li>`;

  const body = `<div class="head">
    <div>
      <h1>All posts</h1>
      <p class="sub">${posts.length} post${posts.length === 1 ? '' : 's'}
        ${latest ? `· newest ${esc(fmtDate(latest))}` : ''}
        · writing saves straight to the database, so what you see here is live.</p>
    </div>
    <a href="/admin/new"><button class="primary" type="button">Write a post</button></a>
  </div>
  ${message ? `<p class="flash ok">${esc(message)}</p>` : ''}
  ${error ? `<p class="flash bad">${esc(error)}</p>` : ''}

  <div class="stats">
    ${STAT(live, 'published')}${STAT(drafts, 'drafts')}
    ${STAT(topics.length, topics.length === 1 ? 'topic' : 'topics')}${STAT(posts.length ? tags.length : 0, 'tags')}
  </div>

  ${posts.length ? `
  <div class="toolbar">
    <input type="search" id="q" placeholder="Search titles, slugs, tags, excerpts…" aria-label="Search posts">
    <select id="state" aria-label="Filter by state">
      <option value="">All states</option><option value="live">Published</option><option value="draft">Drafts</option>
    </select>
    <select id="topic" aria-label="Filter by topic">
      <option value="">${topics.length === 1 ? 'Everything' : 'All'}</option>
      ${topics.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('')}
    </select>
    <select id="sort" aria-label="Sort">
      <option value="new">Newest first</option><option value="old">Oldest first</option><option value="title">Title A–Z</option>
    </select>
    <span class="label" id="found">${posts.length} shown</span>
  </div>
  <div class="bulk" role="toolbar" aria-label="Bulk actions">
    <label class="check"><input type="checkbox" id="pick-all" aria-label="Select all shown posts"> <span id="pick-count">Select posts</span></label>
    <button type="submit" form="bulk" name="action" value="publish" data-bulk disabled>Publish</button>
    <button type="submit" form="bulk" name="action" value="unpublish" data-bulk disabled>Move to drafts</button>
    <button type="submit" form="bulk" name="action" value="delete" class="danger" data-bulk disabled>Delete</button>
  </div>
  <form id="bulk" method="post" action="/admin/bulk" hidden></form>
  <ul class="list" id="list">${posts.map(row).join('')}</ul>
  <p class="empty" id="none" hidden>Nothing matches that. Clear the search to see everything.</p>`
    : `<div class="empty"><p>Nothing here yet.</p>
        <p><a href="/admin/new"><button class="primary" type="button">Write the first post</button></a></p></div>`}
`;

  const script = posts.length ? `<script>
(function(){
  var list = document.getElementById('list'), items = [].slice.call(list.children);
  var q = document.getElementById('q'), state = document.getElementById('state');
  var topic = document.getElementById('topic'), sort = document.getElementById('sort');
  var found = document.getElementById('found'), none = document.getElementById('none');
  function apply(){
    var needle = q.value.trim().toLowerCase(), shown = 0;
    items.forEach(function(li){
      var ok = (!needle || li.dataset.title.indexOf(needle) > -1)
        && (!state.value || li.dataset.state === state.value)
        && (!topic.value || li.dataset.topic === topic.value);
      li.hidden = !ok; if (ok) shown++;
    });
    found.textContent = shown + ' shown';
    none.hidden = shown !== 0;
    refreshBulk();
  }
  [q, state, topic].forEach(function(el){ el.addEventListener('input', apply); });
  sort.addEventListener('change', function(){
    var mode = sort.value;
    items.slice().sort(function(a, b){
      if (mode === 'title') return a.dataset.title.localeCompare(b.dataset.title);
      var da = a.querySelector('.meta span:nth-of-type(2)').textContent;
      var db = b.querySelector('.meta span:nth-of-type(2)').textContent;
      return mode === 'old' ? da.localeCompare(db) : db.localeCompare(da);
    }).forEach(function(li){ list.appendChild(li); });
    apply();
  });
  document.addEventListener('click', function(e){
    var copy = e.target.closest('[data-copy]');
    if (copy) navigator.clipboard.writeText(location.origin + copy.dataset.copy)
      .then(function(){ copy.textContent = 'Copied'; setTimeout(function(){ copy.textContent = 'Copy link'; }, 1200); });
    var form = e.target.closest('form[data-confirm]');
    if (form && !confirm(form.dataset.confirm)) e.preventDefault();
  });
  var bulkForm = document.getElementById('bulk'), pickAll = document.getElementById('pick-all');
  var pickCount = document.getElementById('pick-count');
  var bulkButtons = [].slice.call(document.querySelectorAll('[data-bulk]'));
  function rowOf(cb){ return cb.closest('li'); }
  function picks(){ return items.map(function(li){ return li.querySelector('.pick'); }); }
  function visiblePicks(){ return picks().filter(function(cb){ return !rowOf(cb).hidden; }); }
  function chosenVisible(){ return visiblePicks().filter(function(cb){ return cb.checked; }); }
  function refreshBulk(){
    picks().forEach(function(cb){ cb.disabled = false; });
    var visible = visiblePicks().length, chosen = chosenVisible().length;
    pickCount.textContent = chosen ? chosen + ' selected' : 'Select posts';
    bulkButtons.forEach(function(b){ b.disabled = chosen === 0; });
    pickAll.checked = visible > 0 && chosen === visible;
    pickAll.indeterminate = chosen > 0 && chosen < visible;
  }
  pickAll.addEventListener('change', function(){
    visiblePicks().forEach(function(cb){ cb.checked = pickAll.checked; });
    refreshBulk();
  });
  list.addEventListener('change', function(e){
    if (e.target.classList.contains('pick')) refreshBulk();
  });
  bulkForm.addEventListener('submit', function(e){
    var n = chosenVisible().length;
    if (e.submitter && e.submitter.value === 'delete') {
      if (!confirm('Delete ' + n + ' post' + (n === 1 ? '' : 's') + '? This cannot be undone.')) {
        e.preventDefault();
        return;
      }
    }
    // A post the filter hides is not part of the action, even if it was ticked before filtering.
    picks().forEach(function(cb){ if (rowOf(cb).hidden) cb.disabled = true; });
  });
  apply();
})();
</script>` : '';

  return layout({ title: 'All posts', settings, signedIn: true, nav: 'posts', body, script, nonce });
};

/* ---------- the editor ---------- */

const DEPTH_HINT = value => {
  const n = Number(value);
  if (value === '' || Number.isNaN(n)) return 'auto — the page places it far from the others';
  if (n <= 0.15) return 'at the surface: large, sharp, nearest the light';
  if (n <= 0.5) return 'mid water: the default drift';
  if (n <= 0.8) return 'deep: smaller, softer, drifting';
  return 'the floor of the pond: smallest and quietest';
};

export const postForm = ({ settings, post, topics = [], error = '', isNew, message = '', nonce = '' }) => {
  const tags = tagList(post.tags);

  const body = `<div class="head">
    <div>
      <h1>${isNew ? 'Write a post' : 'Edit post'}</h1>
      <p class="sub">${isNew
        ? 'Markdown in, real pages out. Save and it is live at its own URL.'
        : `Editing <code>/${esc(post.slug)}</code>`}</p>
    </div>
    <div class="btn-row" style="margin:0">
      ${isNew ? '' : `<a href="/admin/edit/${Number(post.id)}" hidden></a>
      <a href="/admin/preview/${Number(post.id)}" target="_blank" rel="noopener"><button type="button" class="ghost">Preview ↗</button></a>
      ${post.published ? `<a href="/post/${encodeURIComponent(post.slug)}" target="_blank" rel="noopener"><button type="button" class="ghost">View live ↗</button></a>` : ''}`}
    </div>
  </div>
  ${message ? `<p class="flash ok">${esc(message)}</p>` : ''}
  ${error ? `<p class="flash bad">${esc(error)}</p>` : ''}

  <form method="post" action="/admin/save" id="post-form">
    <input type="hidden" name="id" value="${esc(post.id || '')}">
    <input type="hidden" name="tags" id="tags-value" value="${esc(tags.join(', '))}">
    <div class="editor">
      <div>
        <div class="card">
          <label class="field"><span>Title</span>
            <input name="title" id="f-title" value="${esc(post.title)}" required
              placeholder="What is this piece called?"></label>

          <div class="grid g2">
            <label class="field"><span>URL slug <span class="count">auto from the title until you edit it</span></span>
              <input name="slug" id="f-slug" value="${esc(post.slug)}" placeholder="my-first-post"></label>
            <div class="row">
              <label class="field"><span>Date</span>
                <input name="date" id="f-date" type="date" value="${esc(post.date)}" required></label>
              <label class="field"><span>Topic</span>
                <input name="topic" id="f-topic" value="${esc(post.topic)}" list="topics" required>
                <datalist id="topics">
                  ${topics.map(t => `<option value="${esc(t)}"></option>`).join('')}
                  <option value="Essays"></option><option value="Notes"></option><option value="Field notes"></option>
                </datalist></label>
            </div>
          </div>

          <label class="field"><span>Excerpt
            <span class="count" data-for="excerpt" data-max="400">0/400</span></span>
            <input name="excerpt" id="f-excerpt" value="${esc(post.excerpt)}" maxlength="400"
              placeholder="One or two lines shown in the pond"><span class="hint">This is what a reader
            sees before they click. Blank is allowed.</span></label>

          <label class="field"><span>Body <span class="count">Markdown</span></span>
            <textarea name="body" id="f-body" required
              placeholder="Opening paragraph.&#10;&#10;NOTE: a margin note on the paragraph above.&#10;&#10;> A pull quote.">${esc(post.body_md)}</textarea></label>
          <p class="hint">A blank line starts a new paragraph. <code>&gt; </code> a pull quote,
            <code>NOTE: </code> a margin note on the paragraph above, <code>## </code> a bold heading,
            <code>**bold**</code> <code>*italic*</code> <code>[text](https://…)</code> a link.</p>
        </div>

        <div class="card">
          <h2>How it sits in the pond</h2>
          <p class="hint">Depth decides how large, how soft and how far it drifts. Tint is its colour.</p>
          <label class="field"><span>Depth <span class="count" id="depth-note">${esc(DEPTH_HINT(post.depth))}</span></span>
            <span class="meter">
              <input type="range" id="f-depth-range" min="0" max="1" step="0.01"
                value="${esc(post.depth === '' || post.depth === null || post.depth === undefined ? '' : post.depth)}">
              <output id="depth-out">${esc(post.depth === '' || post.depth === null || post.depth === undefined ? 'auto' : post.depth)}</output>
            </span>
            <input name="depth" id="f-depth" type="number" min="0" max="1" step="0.01"
              value="${esc(post.depth ?? '')}" placeholder="auto — leave blank" style="margin-top:.5rem"></label>

          <label class="field"><span>Tint <span class="count">optional #RRGGBB</span></span>
            <input name="tint" id="f-tint" value="${esc(post.tint || '')}" placeholder="#C9D3F7"
              pattern="#[0-9A-Fa-f]{6}"></label>
          <div class="swatches" id="swatches" role="group" aria-label="Suggested tints"></div>
        </div>

        <div class="card">
          <h2>Finding it again</h2>
          <label class="field"><span>Tags <span class="count">Enter or comma to add</span></span>
            <input id="tag-input" placeholder="design, school, ai" autocomplete="off"></label>
          <div class="chips" id="tag-chips"></div>
          <p class="hint">Tags are for you: they show in this list and in search. The public page
            still groups posts by Topic.</p>
        </div>

        <details class="card">
          <summary>Search and sharing (optional)</summary>
          <p class="hint" style="margin-top:.8rem">Left blank, these are derived from the title and the
            excerpt, which is almost always right. Set them only when you want the tab or the
            search result to read differently.</p>
          <label class="field"><span>Browser title <span class="count" data-for="metaTitle" data-max="60">0/60</span></span>
            <input name="metaTitle" id="f-metatitle" value="${esc(post.metaTitle || '')}" maxlength="200"
              placeholder="${esc(post.title || 'Same as the title')}"></label>
          <label class="field"><span>Search description <span class="count" data-for="metaDescription" data-max="160">0/160</span></span>
            <input name="metaDescription" id="f-metadesc" value="${esc(post.metaDescription || '')}" maxlength="400"
              placeholder="${esc((post.excerpt || '').slice(0, 160) || 'Same as the excerpt')}"></label>
          <div class="seo-preview" id="seo">
            <span class="u">elyplog.dcism.org › post › ${esc(post.slug || 'slug')}</span>
            <div class="t" id="seo-title"></div>
            <div class="d" id="seo-desc"></div>
          </div>
        </details>

        <div class="card">
          <label class="check"><input type="checkbox" name="published" value="1" id="f-pub" ${post.published ? 'checked' : ''}>
            <span id="pub-label">${post.published ? 'Published — visible to everyone' : 'Draft — only you, at /admin/preview'}</span></label>
        </div>

        <div class="btn-row">
          <button class="primary" type="submit" id="save">${isNew ? 'Publish' : 'Save changes'}</button>
          <a href="/admin"><button type="button" class="ghost">Back to all posts</button></a>
          <span class="keys" id="dirty" aria-live="polite"></span>
        </div>
      </div>

      <aside class="rail">
        <div class="card" style="margin:0">
          <span class="label">Live preview</span>
          <div class="pv" style="margin-top:.6rem">
            <p class="pv-title" id="pv-title"></p>
            <p class="pv-meta" id="pv-meta"></p>
            <p class="pv-excerpt" id="pv-excerpt" hidden></p>
            <div class="pv-body" id="pv-body"></div>
          </div>
          <p class="hint" id="pv-stats"></p>
        </div>
        <details class="card" style="margin:0">
          <summary>Markdown cheat sheet</summary>
          <table class="cheat" style="margin-top:.8rem">
            <tr><td>blank line</td><td>new paragraph</td></tr>
            <tr><td>NOTE: text</td><td>margin note on the paragraph above</td></tr>
            <tr><td>&gt; text</td><td>pull quote</td></tr>
            <tr><td>## text</td><td>bold heading</td></tr>
            <tr><td>**text**</td><td><strong>bold</strong></td></tr>
            <tr><td>*text*</td><td><em>italic</em></td></tr>
            <tr><td>[label](url)</td><td>link (http, mailto or /path only)</td></tr>
          </table>
          <p class="hint" style="margin-top:.8rem">Shortcuts: <kbd>⌘S</kbd> / <kbd>Ctrl+S</kbd> to save.</p>
        </details>
      </aside>
    </div>
  </form>

  ${isNew ? '' : `<div class="card">
    <h2>Delete</h2>
    <p class="hint">Gone immediately, for readers too. There is no undo.</p>
    <form method="post" action="/admin/delete/${Number(post.id)}" style="margin-top:.8rem"
      data-confirm="Delete &quot;${esc(post.title)}&quot;? This cannot be undone.">
      <button class="danger" type="submit">Delete this post</button>
    </form>
  </div>`}`;

  /* The live preview runs previewBlocks — the same function the server tests against its own parser. */
  const script = `<script>
(function(){
  var previewBlocks = ${String(previewBlocks)};
  var $ = function(id){ return document.getElementById(id); };
  var F = { title: $('f-title'), slug: $('f-slug'), date: $('f-date'), topic: $('f-topic'),
    excerpt: $('f-excerpt'), body: $('f-body'), depth: $('f-depth'), depthRange: $('f-depth-range'),
    tint: $('f-tint'), metaTitle: $('f-metatitle'), metaDesc: $('f-metadesc'), pub: $('f-pub') };
  var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  var pretty = function(value){
    var m = /^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(value || '');
    return m ? Number(m[3]) + ' ' + MONTHS[Number(m[2]) - 1] + ' ' + m[1] : value || 'today';
  };
  var blockHtml = function(b){
    return b.quote
      ? '<blockquote>' + b.quote + '</blockquote>'
      : '<div class="blk"><p>' + b.p + '</p>'
        + (b.note ? '<aside><span class="label">Note</span>' + b.note + '</aside>' : '') + '</div>';
  };
  /* Counted from the rendered blocks with the same 220 wpm the post page uses, so the numbers in the
     preview are the numbers a reader will see. */
  var stats = function(blocks){
    var plain = blocks.map(function(b){ return b.p || b.quote || ''; }).join(' ').replace(/<[^>]*>/g, '');
    var parts = plain.split(/\\s+/);
    return { words: parts.filter(Boolean).length, mins: Math.max(1, Math.round(parts.length / 220)) };
  };

  function draw(){
    var blocks = previewBlocks(F.body.value);
    var s = stats(blocks);
    $('pv-title').textContent = F.title.value.trim() || 'Untitled';
    $('pv-meta').textContent = pretty(F.date.value) + ' · ' + (F.topic.value.trim() || 'Essays')
      + (tags.length ? ' · ' + tags.map(function(t){ return '#' + t; }).join(' ') : '')
      + ' · ' + s.mins + ' min read · ' + s.words + ' words';
    var ex = F.excerpt.value.trim();
    var pvEx = $('pv-excerpt');
    pvEx.hidden = !ex; pvEx.textContent = ex;
    $('pv-body').innerHTML = blocks.length ? blocks.map(blockHtml).join('')
      : '<p class="pv-empty">The body is empty. Start typing on the left.</p>';
    $('pv-stats').textContent = s.words + ' words · about ' + s.mins + ' min to read';
    $('seo-title').textContent = (F.metaTitle.value.trim() || F.title.value.trim() || 'Untitled')
      + ' — ' + document.title.split('— ').slice(-1)[0];
    $('seo-desc').textContent = F.metaDesc.value.trim() || F.excerpt.value.trim()
      || 'The excerpt, or the first lines of the post.';
  }

  function count(el, out, max){
    var n = el.value.length;
    out.textContent = n + '/' + max;
    out.dataset.warn = n > max ? '1' : '';
  }
  var counters = [].slice.call(document.querySelectorAll('.count[data-for]'));
  function drawCounters(){
    counters.forEach(function(out){
      var el = F[out.dataset.for === 'metaTitle' ? 'metaTitle' : out.dataset.for];
      if (el) count(el, out, Number(out.dataset.max));
    });
  }

  /* Slug: derived from the title until the writer types their own. */
  var slugTouched = !!F.slug.value;
  F.slug.addEventListener('input', function(){ slugTouched = true; });
  F.title.addEventListener('input', function(){
    if (slugTouched) return;
    F.slug.value = F.title.value.toLowerCase().normalize('NFKD').replace(/[\\u0300-\\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120);
  });

  /* Depth: the slider, the number box and the words stay in step. */
  var hint = function(value){
    var n = Number(value);
    if (value === '' || isNaN(n)) return 'auto — the page places it far from the others';
    if (n <= 0.15) return 'at the surface: large, sharp, nearest the light';
    if (n <= 0.5) return 'mid water: the default drift';
    if (n <= 0.8) return 'deep: smaller, softer, drifting';
    return 'the floor of the pond: smallest and quietest';
  };
  function setDepth(value){
    F.depth.value = value;
    F.depthRange.value = value === '' ? 0.5 : value;
    $('depth-out').textContent = value === '' ? 'auto' : value;
    $('depth-note').textContent = hint(value);
  }
  F.depthRange.addEventListener('input', function(){ setDepth(F.depthRange.value); markDirty(); });
  F.depth.addEventListener('input', function(){ setDepth(F.depth.value); markDirty(); });

  /* Tint: the same tints the blog assigns when a post has none. */
  var TINTS = ['#C9D3F7','#F4C7D4','#C5E0D0','#F6D9B8','#DCCDF0','#F3E7B0'];
  var swatches = $('swatches');
  TINTS.forEach(function(colour){
    var b = document.createElement('button');
    b.type = 'button'; b.style.background = colour; b.title = colour;
    b.setAttribute('aria-label', 'Use ' + colour);
    b.setAttribute('aria-pressed', String((F.tint.value || '').toUpperCase() === colour));
    b.addEventListener('click', function(){
      F.tint.value = (F.tint.value || '').toUpperCase() === colour ? '' : colour;
      [].slice.call(swatches.children).forEach(function(x){ x.setAttribute('aria-pressed', String(x === b && F.tint.value === colour)); });
      markDirty();
    });
    swatches.appendChild(b);
  });

  /* Tags: chips in, one comma string out — the hidden field is what the server reads. */
  var chips = $('tag-chips'), tagInput = $('tag-input'), tagValue = $('tags-value');
  var tags = tagValue.value ? tagValue.value.split(',').map(function(t){ return t.trim(); }).filter(Boolean) : [];
  function drawTags(){
    tagValue.value = tags.join(', ');
    chips.innerHTML = '';
    tags.forEach(function(t, i){
      var chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = '#' + t;
      var x = document.createElement('button');
      x.type = 'button'; x.textContent = '×'; x.setAttribute('aria-label', 'Remove ' + t);
      x.addEventListener('click', function(){ tags.splice(i, 1); drawTags(); markDirty(); });
      chip.appendChild(x); chips.appendChild(chip);
    });
  }
  function addTag(raw){
    var t = String(raw || '').trim().replace(/^#/, '');
    if (!t || tags.length >= 12 || tags.indexOf(t) > -1) return;
    tags.push(t.slice(0, 40)); drawTags(); markDirty();
  }
  tagInput.addEventListener('keydown', function(e){
    if (e.key === 'Enter' || e.key === ','){ e.preventDefault(); addTag(tagInput.value); tagInput.value = ''; }
    if (e.key === 'Backspace' && !tagInput.value && tags.length){ tags.pop(); drawTags(); }
  });
  tagInput.addEventListener('blur', function(){ addTag(tagInput.value); tagInput.value = ''; });

  /* Publish toggle, dirty state, save shortcut, and a guard against losing work. */
  F.pub.addEventListener('change', function(){
    $('pub-label').textContent = F.pub.checked
      ? 'Published — visible to everyone'
      : 'Draft — only you, at /admin/preview';
    dirty = true;
  });
  var form = $('post-form'), dirty = false, saving = false;
  function markDirty(){
    dirty = true;
    $('dirty').textContent = 'unsaved changes';
  }
  form.addEventListener('input', markDirty);
  form.addEventListener('submit', function(){ saving = true; });
  window.addEventListener('beforeunload', function(e){
    if (!dirty || saving) return;
    e.preventDefault(); e.returnValue = '';
  });
  function save(){
    saving = true;
    if (typeof form.requestSubmit === 'function') form.requestSubmit(); else form.submit();
  }
  document.addEventListener('keydown', function(e){
    if ((e.metaKey || e.ctrlKey) && String(e.key).toLowerCase() === 's'){ e.preventDefault(); save(); }
  });
  var confirmForms = document.querySelectorAll('form[data-confirm]');
  confirmForms.forEach(function(f){
    f.addEventListener('submit', function(e){ if (!confirm(f.dataset.confirm)) e.preventDefault(); });
  });

  /* Draw once, then on every change — debounced so a long body stays smooth. */
  tagInput.addEventListener('input', schedule);
  var timer = null;
  function schedule(){
    if (timer) clearTimeout(timer);
    timer = setTimeout(function(){ draw(); drawCounters(); }, 90);
  }
  Object.keys(F).forEach(function(k){
    if (F[k]) F[k].addEventListener('input', schedule);
  });
  F.pub.addEventListener('change', schedule);
  drawTags(); draw(); drawCounters();
})();
</script>`;

  return layout({
    title: isNew ? 'New post' : post.title, settings, signedIn: true, nav: isNew ? 'new' : 'posts',
    body, script, nonce,
  });
};

/* ---------- site details ---------- */

export const settingsPage = ({ settings, message = '', error = '', nonce = '' }) =>
  layout({
    title: 'Site details', settings, signedIn: true, nav: 'settings', nonce,
    body: `<div class="head">
      <div>
        <h1>Site details</h1>
        <p class="sub">The words around your writing: your name, the hero line, the About page and the
          footer. Everything here is live the moment you save it.</p>
      </div>
      <a href="/" target="_blank" rel="noopener"><button type="button" class="ghost">View site ↗</button></a>
    </div>
    ${message ? `<p class="flash ok">${esc(message)}</p>` : ''}
    ${error ? `<p class="flash bad">${esc(error)}</p>` : ''}

    <form method="post" action="/admin/settings" id="settings-form">
      <div class="card">
        <h2>Identity</h2>
        <p class="hint">These are the first things a reader sees, and they appear in the nav, the
          browser tab, RSS and the sitemap.</p>
        <div class="grid g2">
          <label class="field"><span>Your name <span class="count">required</span></span>
            <input name="name" id="s-name" value="${esc(settings.name)}" required></label>
          <label class="field"><span>Hero statement <span class="count">required</span></span>
            <input name="hero" id="s-hero" value="${esc(settings.hero)}" required></label>
        </div>
        <label class="field"><span>Lede under the hero
          <span class="count" data-for="lede" data-max="180">0/180</span></span>
          <input name="lede" id="s-lede" value="${esc(settings.lede)}"></label>
        <label class="field"><span>Meta description
          <span class="count" data-for="description" data-max="160">0/160</span></span>
          <input name="description" id="s-description" value="${esc(settings.description)}">
          <span class="hint">Used for the home page in search results and share cards.</span></label>
      </div>

      <div class="card">
        <h2>About page</h2>
        <div class="grid g2">
          <label class="field"><span>Page title</span>
            <input name="aboutTitle" value="${esc(settings.aboutTitle)}"></label>
          <label class="field"><span>About meta description</span>
            <input name="aboutDescription" value="${esc(settings.aboutDescription)}"></label>
        </div>
        <label class="field"><span>Body <span class="count">Markdown — the same rules as a post</span></span>
          <textarea name="about" id="s-about" style="min-height:14rem">${esc(settings.about)}</textarea></label>
        <p class="hint"><code>NOTE: </code> and <code>&gt; </code> work here exactly as they do in a post.</p>
      </div>

      <div class="card">
        <h2>Footer</h2>
        <div class="grid g2">
          <label class="field"><span>Footer line</span>
            <input name="colophon" value="${esc(settings.colophon)}"></label>
          <label class="field"><span>Footer meta <span class="count">after the year</span></span>
            <input name="footer" value="${esc(settings.footer)}"></label>
        </div>
      </div>

      <div class="btn-row">
        <button class="primary" type="submit">Save site details</button>
        <span class="keys" id="dirty" aria-live="polite"></span>
      </div>
    </form>

    <div class="card" style="margin-top:1.6rem">
      <h2>Password and account</h2>
      <p class="hint">The username and password are not stored in the database — they are
        <code>ADMIN_USERNAME</code> and <code>ADMIN_PASSWORD_HASH</code> in the server's
        <code>.env</code>. To change the password, run <code>npm run hash -- "new password"</code> in
        <code>~/elyplog</code>, paste the result into <code>.env</code>, then
        <code>pm2 restart elyplog</code>.</p>
    </div>`,
    script: `<script>
(function(){
  var form = document.getElementById('settings-form'), dirty = false, saving = false;
  form.addEventListener('input', function(){ dirty = true; document.getElementById('dirty').textContent = 'unsaved changes'; });
  form.addEventListener('submit', function(){ saving = true; });
  window.addEventListener('beforeunload', function(e){ if (dirty && !saving){ e.preventDefault(); e.returnValue = ''; } });
  document.addEventListener('keydown', function(e){
    if ((e.metaKey || e.ctrlKey) && String(e.key).toLowerCase() === 's'){
      e.preventDefault(); saving = true;
      if (typeof form.requestSubmit === 'function') form.requestSubmit(); else form.submit();
    }
  });
  function draw(){
    [].slice.call(document.querySelectorAll('.count[data-for]')).forEach(function(out){
      var el = document.getElementById('s-' + out.dataset.for);
      if (!el) return;
      out.textContent = el.value.length + '/' + out.dataset.max;
      out.dataset.warn = el.value.length > Number(out.dataset.max) ? '1' : '';
    });
  }
  form.addEventListener('input', draw); draw();
})();
</script>`,
  });
