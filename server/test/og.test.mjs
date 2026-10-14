/**
 * Tests for the share cards: the PNG container, the drawing, and the files that ship.
 *
 * The encoder is hand-rolled, so the container is checked structurally here (signature, IHDR fields,
 * an IDAT that inflates to exactly one filter byte plus a scanline per row, IEND last) and the files
 * on disk are checked for the size they claim. Independent decoders (macOS sips, Python PIL, the
 * browser) were used once to confirm the bytes are a real PNG; these tests keep it from regressing.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { readFile } from 'node:fs/promises';

import { encodePng, renderCard, cardName } from '../tools/make-og.mjs';
import { TINTS, ogCardName } from '../src/render.js';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
const W = 1200;
const H = 630;

const chunkAt = (buf, offset) => ({
  length: buf.readUInt32BE(offset),
  type: buf.toString('latin1', offset + 4, offset + 8),
  data: buf.subarray(offset + 8, offset + 8 + buf.readUInt32BE(offset)),
});

const pixel = (rgb, x, y) => [rgb[(y * W + x) * 3], rgb[(y * W + x) * 3 + 1], rgb[(y * W + x) * 3 + 2]];

test('the PNG container is well formed', () => {
  const rgb = renderCard(null);
  const png = encodePng(W, H, rgb);

  assert.ok(png.subarray(0, 8).equals(SIGNATURE), 'starts with the PNG signature');

  const ihdr = chunkAt(png, 8);
  assert.equal(ihdr.type, 'IHDR');
  assert.equal(ihdr.length, 13);
  assert.equal(ihdr.data.readUInt32BE(0), W);
  assert.equal(ihdr.data.readUInt32BE(4), H);
  assert.equal(ihdr.data[8], 8, 'eight bits per channel');
  assert.equal(ihdr.data[9], 2, 'truecolour');
  assert.equal(ihdr.data[12], 0, 'not interlaced');

  const idat = chunkAt(png, 8 + 12 + ihdr.length);
  assert.equal(idat.type, 'IDAT');
  const raw = inflateSync(idat.data);
  assert.equal(raw.length, (W * 3 + 1) * H, 'one filter byte plus a scanline per row');
  for (let y = 0; y < H; y += 1) assert.equal(raw[y * (W * 3 + 1)], 0, 'filter 0 on every row');

  const iend = chunkAt(png, png.length - 12);
  assert.equal(iend.type, 'IEND');
  assert.equal(iend.length, 0);
});

test('the drawing uses the page palette, the post colour and the ripple rings', () => {
  const plain = renderCard(null);
  const tinted = renderCard('#C9D3F7');

  assert.equal(plain.length, W * H * 3);
  assert.deepEqual(pixel(plain, 1180, 620), [247, 245, 251], 'the neutral card is paper at the corner');
  assert.deepEqual(pixel(plain, 40, 20), [247, 245, 251], 'and has no wash in its top-left');

  const wash = pixel(tinted, 40, 20);
  assert.notDeepEqual(wash, [247, 245, 251], 'the tinted card carries its colour');
  assert.ok(wash[2] > wash[0], 'the blue tint leans blue, not warm');

  /* 0.76 and 0.60 are the drop's position, straight from the drawing. */
  const cx = Math.round(0.76 * W);
  const cy = Math.round(0.60 * H);
  const drop = pixel(tinted, cx, cy);
  const gap = pixel(tinted, cx + 140, cy);
  const onRing = pixel(tinted, cx + 172, cy);
  assert.ok(drop[0] < gap[0], 'the drop is darker than the paper around it');
  assert.ok(onRing[0] < gap[0], 'a ring is darker than the space between rings');
  assert.ok(onRing[0] > drop[0], 'and lighter than the drop itself');
});

test('card files are named after their colour, the neutral one excepted', () => {
  assert.equal(cardName('#C9D3F7'), 'c9d3f7');
  assert.equal(cardName(null), 'default');
});

test('a page only ever points at a card that was drawn', () => {
  assert.equal(ogCardName('#C9D3F7'), 'c9d3f7');
  assert.equal(ogCardName('#c9d3f7'), 'c9d3f7', 'case does not matter');
  assert.equal(ogCardName('#123456'), 'default', 'an un-drawn colour falls back');
  assert.equal(ogCardName(''), 'default');
  assert.equal(ogCardName(null), 'default');
  assert.equal(ogCardName(undefined), 'default');
});

test('every card a page can ask for exists, at the size platforms expect', async () => {
  for (const tint of [null, ...TINTS]) {
    const name = cardName(tint);
    const file = new URL(`../public/og/${name}.png`, import.meta.url);
    const png = await readFile(file);
    assert.ok(png.subarray(0, 8).equals(SIGNATURE), `${name}.png is a PNG`);
    const ihdr = chunkAt(png, 8);
    assert.equal(ihdr.data.readUInt32BE(0), W, `${name}.png width`);
    assert.equal(ihdr.data.readUInt32BE(4), H, `${name}.png height`);
  }
});
