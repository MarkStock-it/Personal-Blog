/**
 * Contrast and type-floor tests for the two stylesheets.
 *
 * The page mixes text toward each post's own tint with `color-mix(in oklab, …)`, so a colour that
 * passes on one tint can fail on another — the deployed build shipped its metadata label at 4.32:1
 * on the periwinkle drop. These tests read the palette, the mix shares and the depth coefficient out
 * of the CSS, so the stylesheet stays the single source of truth, and assert the floors.
 *
 * The oklab math is calibrated against the browser rather than trusted: Chromium renders
 * `ink 66% + #F3E7B0` as `oklab(0.505868 0.00783355 -0.0059577)` and measures that label's contrast
 * at 4.72:1 — the first test below asserts this module produces the same two numbers.
 *
 * Run with: npm test   (node --test test/)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { TINTS } from '../src/render.js';

const read = rel => readFile(new URL(rel, import.meta.url), 'utf8');

/* ---------- sRGB <-> oklab, and CSS color-mix(in oklab, …) ---------- */

/** #abc and #aabbcc are both fine in the stylesheets; the maths needs six digits. */
const normalizeHex = hex => {
  const value = String(hex).trim();
  return /^#[0-9a-f]{3}$/i.test(value)
    ? '#' + [...value.slice(1)].map(c => c + c).join('')
    : value;
};

const hexToRgb = hex => {
  const n = parseInt(normalizeHex(hex).replace('#', ''), 16);
  return [n >> 16 & 255, n >> 8 & 255, n & 255];
};

const srgbToLinear = v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const linearToSrgb = v => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);

function linearToOklab([r, g, b]) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ];
}

function oklabToLinear([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
}

const oklabOf = hex => linearToOklab(hexToRgb(normalizeHex(hex)).map(v => srgbToLinear(v / 255)));

const hexOfOklab = ([L, a, b]) => '#' + oklabToLinear([L, a, b])
  .map(v => Math.max(0, Math.min(255, Math.round(linearToSrgb(v) * 255))).toString(16).padStart(2, '0'))
  .join('');

/** CSS color-mix(in oklab, a p%, b): both colours opaque here, so premultiplication is a no-op. */
function mixOklab(a, p, b) {
  const A = oklabOf(a), B = oklabOf(b);
  return hexOfOklab(A.map((v, i) => v * p + B[i] * (1 - p)));
}

/** Flatten an opaque colour over another at `alpha` — what a translucent drop shows the reader. */
function over(top, alpha, bottom) {
  const t = hexToRgb(top), b = hexToRgb(bottom);
  return '#' + t.map((v, i) => Math.round(v * alpha + b[i] * (1 - alpha)).toString(16).padStart(2, '0')).join('');
}

const relLum = hex => {
  const [r, g, b] = hexToRgb(hex).map(v => srgbToLinear(v / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

function contrast(a, b) {
  const l1 = relLum(a), l2 = relLum(b);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

const AA = 4.5;          // normal text: the labels, meta and body copy here are all under 24px
const NON_TEXT = 3;      // focus rings and other UI boundaries (WCAG 1.4.11)

/* ---------- reading the stylesheets ---------- */

const page = await read('../src/page.html');
const admin = await read('../src/admin.js');

/** Every token declared in a :root block, comments and whitespace stripped. */
function tokens(source, what) {
  const blocks = [...source.matchAll(/:root\{([\s\S]*?)\}/g)];
  assert.ok(blocks.length, `${what} declares a :root block`);
  const map = new Map();
  for (const [, body] of blocks) {
    for (const m of body.matchAll(/--([a-z0-9-]+)\s*:\s*([^;}]+)/gi)) map.set(m[1], m[2].trim());
  }
  return map;
}

/** A colour a rule uses, as a hex string. */
function colour(source, re, what) {
  const m = source.match(re);
  assert.ok(m, `could not find ${what}`);
  const value = normalizeHex(m[1]);
  assert.match(value, /^#[0-9a-f]{6}$/i, `${what} must be a hex colour, got ${m[1].trim()}`);
  return value;
}

/** A percentage inside a color-mix, as a fraction. */
function share(source, re, what) {
  const m = source.match(re);
  assert.ok(m, `could not find ${what}`);
  return Number(m[1]) / 100;
}

const pageTokens = tokens(page, 'page.html');
const adminTokens = tokens(admin, 'admin.js');

const token = (map, name) => {

  const raw = map.get(name);
  assert.ok(raw, `--${name} is not declared`);
  const value = normalizeHex(raw);
  assert.match(value, /^#[0-9a-f]{6}$/i, `--${name} must be a hex colour, got ${raw}`);
  return value;
};

/** A colour that may be written out or named by a token. */
function resolve(value, map, what) {
  assert.ok(value, `could not find ${what}`);
  const variable = value.match(/^var\(\s*--([a-z0-9-]+)\s*\)$/i);
  if (!variable) return normalizeHex(value);
  const raw = map.get(variable[1]);
  assert.ok(raw, `${what} names --${variable[1]}, which is not declared`);
  return normalizeHex(raw);
}

const FIELD = token(pageTokens, 'field');
const PAPER = token(pageTokens, 'paper');
const INK = token(pageTokens, 'ink');
const MUT = token(pageTokens, 'mut');
const ACCENT = token(pageTokens, 'accent');

const labelShare = share(page, /\.post \.label\{[^}]*?var\(--ink\) (\d+)%,var\(--tint\)/, 'the label ink share');
const excerptShare = share(page, /\.post-ex\{[^}]*?var\(--ink\) (\d+)%,var\(--tint\)/, 'the excerpt ink share');
const readWash = share(page, /body\[data-view=read\]\{[^}]*?var\(--wash[^)]*\) (\d+)%,transparent/, 'the reading wash');
const noteWash = share(page, /\.blk aside\{[^}]*?var\(--wash[^)]*\) (\d+)%,var\(--paper\)/, 'the margin-note wash');
const passWash = share(page, /\.pass\{[^}]*?var\(--wash[^)]*\) (\d+)%,var\(--paper\)/, 'the signup card wash');

const depthOpacity = (() => {
  const m = page.match(/opacity:calc\(1 - (\.\d+) \* var\(--depth\)\)/);
  assert.ok(m, 'the drop opacity must stay a function of --depth');
  return 1 - Number(m[1]);          // a drop at depth 1 is the most transparent, so the worst case
})();

/**
 * The background a reader's eye sees behind a drop's text: the tint, or the tint at the shape's
 * lowest opacity composited over the field (blur mixes the same colours at its edge). The white
 * radial highlight is ignored on purpose — it lightens, which only helps dark text.
 */
const dropBackgrounds = tint => [tint, over(tint, depthOpacity, FIELD)];

const worstOn = (fg, backgrounds) => Math.min(...backgrounds.map(bg => contrast(fg, bg)));

/* ---------- the calibration ---------- */

test('the oklab mixing reproduces what the browser computed', () => {
  const mixed = oklabOf(mixOklab(INK, 0.66, '#F3E7B0'));
  const browser = [0.505868, 0.00783355, -0.0059577];
  for (let i = 0; i < 3; i += 1) {
    assert.ok(Math.abs(mixed[i] - browser[i]) < 1e-3,
      `oklab component ${i}: mine ${mixed[i]}, Chromium ${browser[i]}`);
  }
  assert.ok(Math.abs(contrast(mixOklab(INK, 0.66, '#F3E7B0'), '#F3E7B0') - 4.72) < 0.01,
    'the label colour Chromium measured at 4.72:1');
});

/* ---------- post text on every tint ---------- */

test('text on every post tint clears AA at full strength and at the worst depth', () => {
  assert.ok(TINTS.length >= 6, 'the palette still has its six tints');
  for (const tint of TINTS) {
    const backgrounds = dropBackgrounds(tint);

    const worstLabel = worstOn(mixOklab(INK, labelShare, tint), backgrounds);
    assert.ok(worstLabel >= AA,
      `the drips label on ${tint} is ${worstLabel.toFixed(2)}:1 — the mix needs more ink (${labelShare})`);

    const worstExcerpt = worstOn(mixOklab(INK, excerptShare, tint), backgrounds);
    assert.ok(worstExcerpt >= AA, `the excerpt on ${tint} is ${worstExcerpt.toFixed(2)}:1`);

    const worstTitle = worstOn(INK, backgrounds);
    assert.ok(worstTitle >= AA, `the title on ${tint} is ${worstTitle.toFixed(2)}:1`);
  }
});

/* ---------- muted text, on every surface it can land on ---------- */

test('muted text clears AA on the field, the paper and every tinted card', () => {
  assert.ok(contrast(MUT, FIELD) >= AA, `muted on the field is ${contrast(MUT, FIELD).toFixed(2)}:1`);
  assert.ok(contrast(MUT, PAPER) >= AA, `muted on the paper is ${contrast(MUT, PAPER).toFixed(2)}:1`);

  for (const tint of TINTS) {
    /* The reading view lays the post's colour over the paper as an alpha wash, so this is the
       background under the byline, the margin-note label and the signup note. */
    const reading = mixOklab(tint, readWash, PAPER);
    assert.ok(contrast(MUT, reading) >= AA,
      `muted over the ${tint} reading wash is ${contrast(MUT, reading).toFixed(2)}:1`);

    const note = mixOklab(tint, noteWash, PAPER);
    assert.ok(contrast(MUT, note) >= AA,
      `the note label on a ${tint} note card is ${contrast(MUT, note).toFixed(2)}:1`);

    const pass = mixOklab(tint, passWash, PAPER);
    assert.ok(contrast(MUT, pass) >= AA,
      `the signup note on a ${tint} card is ${contrast(MUT, pass).toFixed(2)}:1`);
  }
});

/** #rgb and #rgba expand to six digits plus an alpha; the stylesheets use #fffc for the input. */
function withAlpha(value) {
  const v = String(value).trim();
  const short = v.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])([0-9a-f])$/i);
  if (short) return { hex: '#' + short.slice(1, 4).map(c => c + c).join(''), alpha: parseInt(short[4] + short[4], 16) / 255 };
  const long = v.match(/^#([0-9a-f]{6})([0-9a-f]{2})$/i);
  if (long) return { hex: '#' + long[1], alpha: parseInt(long[2], 16) / 255 };
  return { hex: normalizeHex(v), alpha: 1 };
}

/* ---------- the interface around the text ---------- */

test('the signup placeholder is readable on every card, not just the palest', () => {
  const input = page.match(/\.pass input\{[^}]*background:(#[0-9a-f]{3,8})/i);
  assert.ok(input, 'the signup input still has its translucent background');
  const { hex: top, alpha } = withAlpha(input[1]);
  const placeholder = page.match(/\.pass input::placeholder\{[^}]*color:var\(--([a-z0-9-]+)\)/i);
  assert.ok(placeholder, 'the placeholder colour must be set explicitly: the browser default failed AA');
  const fg = token(pageTokens, placeholder[1]);

  for (const tint of TINTS) {
    const card = mixOklab(tint, passWash, PAPER);
    const field = over(top, alpha, card);      // the input's own wash over the card
    const ratio = contrast(fg, field);
    assert.ok(ratio >= AA,
      `the placeholder on the ${tint} card is ${ratio.toFixed(2)}:1 (it was 4.49:1 with the browser default)`);
  }
});

test('a focus ring stays visible on every tint, and the admin keeps its contrast', () => {
  for (const tint of TINTS) {
    const ring = contrast(ACCENT, tint);
    assert.ok(ring >= NON_TEXT, `the focus ring on ${tint} is ${ring.toFixed(2)}:1`);
  }

  const card = token(adminTokens, 'card');
  const adminField = token(adminTokens, 'field');
  const deep = token(adminTokens, 'deep');
  const mut = token(adminTokens, 'mut');

  assert.ok(contrast(mut, card) >= AA, `admin muted on a card is ${contrast(mut, card).toFixed(2)}:1`);
  assert.ok(contrast(mut, adminField) >= AA, `admin muted on a field is ${contrast(mut, adminField).toFixed(2)}:1`);
  assert.ok(contrast(INK, card) >= AA, `admin ink on a card is ${contrast(INK, card).toFixed(2)}:1`);

  /* The brand tag sits on the ink bar; the status pills carry their own colour on their own wash. */
  const tag = colour(admin, /\.brand \.tag\{[^}]*color:(#[0-9a-f]{6})/i, 'the brand tag colour');
  assert.ok(contrast(tag, deep) >= AA, `the brand tag is ${contrast(tag, deep).toFixed(2)}:1 on the bar`);

  for (const [name, state] of [['live', 'good'], ['draft', 'warn']]) {
    /* The property is matched after { or ;, so `border-color:` cannot be mistaken for `color:`, and
       the value may be a token rather than a literal. */
    const pattern = property => new RegExp(
      `\\.pill\\.${name}\\{[^}]*?(?<![\\w-])${property}:(#[0-9a-f]{6}|var\\(--[a-z0-9-]+\\))`, 'i',
    );
    const fg = resolve(admin.match(pattern('color'))?.[1], adminTokens, `the ${name} pill text`);
    const bg = resolve(admin.match(pattern('background'))?.[1], adminTokens, `the ${name} pill background`);
    assert.ok(contrast(fg, bg) >= AA, `the ${name} pill is ${contrast(fg, bg).toFixed(2)}:1`);
    assert.ok(adminTokens.has(state), `--${state} is still declared`);
  }
});

/* ---------- the type floor ---------- */

/** The minimum a CSS length can render at: clamp() bottoms out at its first argument. */
function minimumPx(value, map, seen = new Set()) {
  const v = String(value).replace(/\/\*[\s\S]*?\*\//g, '').trim();
  const rem = v.match(/^([\d.]+)rem$/);
  if (rem) return Number(rem[1]) * 16;
  const px = v.match(/^([\d.]+)px$/);
  if (px) return Number(px[1]);
  if (/^clamp\(/.test(v)) return minimumPx(v.slice(6).split(',')[0], map, seen);
  const variable = v.match(/^var\(\s*--([a-z0-9-]+)\s*(?:,([\s\S]*))?\)$/i);
  if (variable) {
    if (seen.has(variable[1])) return null;
    seen.add(variable[1]);
    if (map.has(variable[1])) return minimumPx(map.get(variable[1]), map, seen);
    return variable[2] ? minimumPx(variable[2], map, seen) : null;
  }
  return null;                     // em/%/inherit: relative to a parent, so unreadable here
}

/**
 * The size inside a `font:` shorthand, which is how this codebase sets most of its type. The size is
 * the first length-shaped thing in the declaration — the family list comes after it, and a var() font
 * stack looks elsewise identical to a var() size.
 */
function sizeFromShorthand(declaration) {
  const size = declaration.match(/(clamp\([^)]*\)|var\(--[a-z0-9-]+\)|[\d.]+(?:rem|px))/i);
  return size ? size[1] : null;
}

const CSS_WIDE = /^(inherit|initial|unset|revert|revert-layer)$/i;

const exempt = new Set(['.86em']);   // one relative size; its parent is 16px, so it lands at 13.8px

test('no text in either stylesheet can render below 12px', () => {
  let resolved = 0;
  for (const [name, source, map] of [['page.html', page, pageTokens], ['admin.js', admin, adminTokens]]) {
    const seen = new Set();
    for (const decl of source.matchAll(/font-size:\s*([^;}]+)/g)) {
      const raw = decl[1].trim();
      const px = minimumPx(raw, map);
      if (px === null) {
        assert.ok(exempt.has(raw), `${name}: font-size:${raw} is below the scan and not exempt`);
        continue;
      }
      seen.add(raw);
      resolved += 1;
      assert.ok(px >= 12, `${name}: font-size:${raw} bottoms out at ${px}px, under the 12px floor`);
    }
    for (const decl of source.matchAll(/font:\s*([^;}]+)/g)) {
      if (CSS_WIDE.test(decl[1].trim())) continue;      // font:inherit carries no size of its own
      const size = sizeFromShorthand(decl[1]);
      assert.ok(size, `${name}: cannot read the size out of the shorthand font:${decl[1]}`);
      const px = minimumPx(size, map);
      assert.ok(px !== null, `${name}: cannot resolve the shorthand size ${size}`);
      seen.add(size);
      resolved += 1;
      assert.ok(px >= 12, `${name}: font:${decl[1]} carries text at ${px}px, under the 12px floor`);
    }
    assert.ok(seen.size >= 5, `${name}: the size scan found only ${seen.size} declarations`);
  }
  assert.ok(resolved >= 30, `the size scan only resolved ${resolved} declarations`);
});

test('the label rung is a flat 12px, not a fluid clamp', () => {
  const rung = pageTokens.get('step--1');
  assert.equal(rung, '.75rem', '--step--1 must stay a flat 12px: the fluid rung dropped to 11px on a phone');
  assert.equal(minimumPx(rung, pageTokens), 12);
});

test('the admin captions are at the floor too, not under it', () => {
  for (const declaration of ['.label', '.stat span', '.pill', 'label.field>span']) {
    const match = admin.match(new RegExp(`${declaration.replace(/[.>]/g, m => `\\${m}`)}\\{[^}]*?font-size:\\s*([^;}]+)`));
    assert.ok(match, `could not find ${declaration} in the admin styles`);
    const px = minimumPx(match[1], adminTokens);
    assert.ok(px >= 12, `${declaration} is ${px}px`);
  }
});
