/**
 * Draws the social share cards into ../public/og/ and writes them as PNG.
 *
 *   node tools/make-og.mjs
 *
 * Why the cards carry no text: a post is written and retitled in the admin area with no build step,
 * so a card holding a title would go stale the moment the title changed. These cards are assets —
 * the post's colour, drawn in the page's own ripple language — and the words arrive beside them
 * from og:title and og:description.
 *
 * Why a hand-rolled PNG: rasterising text would need a native image library (sharp, canvas), which
 * this shared host cannot be assumed to have, and the whole project builds with none. A PNG is a
 * signature, three chunks and a zlib stream, all of which node:zlib and node:buffer already do.
 * PNG output is verified against independent decoders (macOS sips, Python PIL, the browser).
 */
import { deflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';

import { TINTS } from '../src/render.js';

const W = 1200;
const H = 630;

const PAPER = [0xF7, 0xF5, 0xFB];
const INK = [0x2B, 0x27, 0x42];
const EDGE = [0xD8, 0xD3, 0xE8];

const hexToRgb = hex => {
  const n = parseInt(String(hex).replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/* ---------------- PNG container ---------------- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typed = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed), 0);
  return Buffer.concat([length, typed, crc]);
}

/** Truecolour 8-bit, no interlacing, every scanline filter 0 (the data is smooth; filtering buys little). */
export function encodePng(width, height, rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 2;   // colour type: truecolour
  ihdr[10] = 0;  // deflate
  ihdr[11] = 0;  // adaptive filtering
  ihdr[12] = 0;  // no interlace

  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgb.copy ? rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
      : raw.set(rgb.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------------- the drawing ---------------- */

const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/* One drop, then the rings it left: the same idea as the page, at share-card size. */
const RINGS = [
  { r: 46, width: 3, alpha: 0.26 },
  { r: 106, width: 3, alpha: 0.19 },
  { r: 172, width: 2.5, alpha: 0.13 },
  { r: 244, width: 2, alpha: 0.085 },
  { r: 320, width: 2, alpha: 0.05 },
];
const DROP = { x: 0.76, y: 0.60, r: 9 };

/**
 * @param {string|null} tint  a card colour, or null for the neutral card
 * @returns {Buffer} width*height*3 bytes of RGB
 */
export function renderCard(tint) {
  const rgb = Buffer.alloc(W * H * 3);
  const wash = tint ? hexToRgb(tint) : null;
  const cx = DROP.x * W;
  const cy = DROP.y * H;
  const washRadius = 0.78 * W;
  const washX = 0.18 * W;
  const washY = -0.10 * H;

  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      let colour = PAPER;

      /* The tint arrives from the top-left and fades long before the far corner, exactly as the
         reading page mixes a post's colour back toward the paper. */
      if (wash) {
        const d = Math.hypot(x - washX, y - washY) / washRadius;
        const t = 0.52 * clamp01(1 - d) ** 1.6;
        if (t > 0) colour = mix(colour, wash, t);
      }

      /* The surface: one hairline that fades out toward both edges. */
      const onSurface = Math.abs(y - cy) <= 1;
      if (onSurface) {
        const t = 0.9 * clamp01(1 - Math.abs(x - W / 2) / (W / 2)) ** 0.6;
        colour = mix(colour, EDGE, t);
      }

      /* The rings, each with a pixel and a quarter of soft edge so nothing looks stepped. */
      const dist = Math.hypot(x - cx, y - cy);
      for (const ring of RINGS) {
        const half = ring.width / 2;
        const d = Math.abs(dist - ring.r);
        const coverage = d <= half ? 1 : clamp01(1 - (d - half) / 1.25);
        if (coverage > 0) colour = mix(colour, INK, ring.alpha * coverage);
      }
      if (dist < DROP.r) {
        const coverage = dist <= DROP.r - 1.25 ? 1 : clamp01((DROP.r - dist) / 1.25);
        colour = mix(colour, INK, 0.5 * coverage);
      }

      const i = (y * W + x) * 3;
      rgb[i] = Math.round(colour[0]);
      rgb[i + 1] = Math.round(colour[1]);
      rgb[i + 2] = Math.round(colour[2]);
    }
  }
  return rgb;
}

/** The file name a card is served under: `default`, or the tint without its hash. */
export const cardName = tint => (tint ? String(tint).replace('#', '').toLowerCase() : 'default');

async function main() {
  const dir = new URL('../public/og/', import.meta.url);
  await mkdir(dir, { recursive: true });
  for (const tint of [null, ...TINTS]) {
    const name = cardName(tint);
    const png = encodePng(W, H, renderCard(tint));
    await writeFile(new URL(`${name}.png`, dir), png);
    console.log(`${name}.png  ${W}x${H}  ${(png.length / 1024).toFixed(1)} kB`);
  }
}

/* Only generate when run as a script, so the encoder and the drawing can be imported by tests. */
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  await main();
}
