/**
 * Admin auth: password hashing and signed session cookies.
 *
 * Password records are self-describing single strings, so the cost can be raised
 * later without invalidating old hashes:
 *
 *     scrypt$<N>$<saltHex>$<keyHex>
 *
 * N is the scrypt cost recorded per record; the block size and parallelisation
 * (SCRYPT_R / SCRYPT_P below) are fixed by this module. Session cookies are
 *
 *     <base64url payload>.<base64url hmac>
 *
 * where the payload is JSON `{"exp":<epoch ms>}` and the signature is
 * HMAC-SHA256 over the base64url payload string, keyed by SESSION_SECRET.
 *
 * Deliberately dependency-free: only node:crypto, no database and no package,
 * so it runs unchanged on the shared host.
 */

import crypto from 'node:crypto';

const ALGO = 'scrypt';
const SCRYPT_N = 16384; // cost: recorded in every record
const SCRYPT_R = 8; // block size
const SCRYPT_P = 1; // parallelisation
const KEY_LEN = 64; // derived key length in bytes
const SALT_LEN = 16; // salt length in bytes
const MAX_N = 1 << 20; // refuse absurd costs from a tampered record

const isHex = (s, bytes) =>
  typeof s === 'string' && s.length === bytes * 2 && /^[0-9a-fA-F]+$/.test(s);

/** Hash a password for .env. Returns '' for an empty password, which is never valid. */
export function hashPassword(password) {
  if (typeof password !== 'string' || password === '') return '';
  const salt = crypto.randomBytes(SALT_LEN);
  const key = crypto.scryptSync(password, salt, KEY_LEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return [ALGO, SCRYPT_N, salt.toString('hex'), key.toString('hex')].join('$');
}

/** True only for a well-formed record whose key matches. Never throws. */
export function verifyPassword(password, stored) {
  try {
    if (typeof password !== 'string' || password === '') return false;
    if (typeof stored !== 'string') return false;
    const parts = stored.split('$');
    if (parts.length !== 4 || parts[0] !== ALGO) return false;
    const n = Number(parts[1]);
    if (!Number.isInteger(n) || n < 2 || n > MAX_N) return false;
    if (!isHex(parts[2], SALT_LEN) || !isHex(parts[3], KEY_LEN)) return false;
    const salt = Buffer.from(parts[2], 'hex');
    const expected = Buffer.from(parts[3], 'hex');
    const actual = crypto.scryptSync(password, salt, expected.length, { N: n, r: SCRYPT_R, p: SCRYPT_P });
    // Equal length by construction above, so this cannot throw.
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/**
 * Compare two strings without leaking their length or contents through timing: both sides are
 * hashed to a fixed 32 bytes first, so timingSafeEqual always gets equal-length buffers.
 */
export function safeEqual(a, b) {
  const da = crypto.createHash('sha256').update(String(a ?? ''), 'utf8').digest();
  const db = crypto.createHash('sha256').update(String(b ?? ''), 'utf8').digest();
  return crypto.timingSafeEqual(da, db);
}

/**
 * True only when BOTH the owner's username and password are right.
 *
 * Both checks are always evaluated, and the result is combined afterwards: short-circuiting on a
 * wrong username would make a wrong username measurably faster than a right one, which tells an
 * attacker half the answer for free.
 */
export function verifyLogin(username, password, expectedUser, passwordHash) {
  const userOk = safeEqual(String(username ?? '').trim(), String(expectedUser ?? '').trim());
  const passOk = verifyPassword(String(password ?? ''), passwordHash);
  return userOk && passOk;
}

function sign(secret, payloadPart) {
  return crypto.createHmac('sha256', secret).update(payloadPart).digest('base64url');
}

/** Build a cookie value that expires ttlMs from now. */
export function issueSession(secret, ttlMs) {
  const exp = Date.now() + (Number(ttlMs) || 0);
  const payloadPart = Buffer.from(JSON.stringify({ exp }), 'utf8').toString('base64url');
  return `${payloadPart}.${sign(secret, payloadPart)}`;
}

/** Verify a cookie value. Returns { ok:false } for anything malformed, tampered or expired. */
export function readSession(secret, token) {
  try {
    if (typeof secret !== 'string' || secret === '') return { ok: false };
    if (typeof token !== 'string' || token === '') return { ok: false };
    const dot = token.lastIndexOf('.');
    if (dot <= 0 || dot === token.length - 1) return { ok: false };
    const payloadPart = token.slice(0, dot);
    const got = Buffer.from(token.slice(dot + 1));
    const want = Buffer.from(sign(secret, payloadPart));
    if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return { ok: false };
    const data = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));
    if (!data || typeof data.exp !== 'number' || !Number.isFinite(data.exp)) return { ok: false };
    if (data.exp <= Date.now()) return { ok: false };
    return { ok: true, exp: data.exp };
  } catch {
    return { ok: false };
  }
}

/** A fresh SESSION_SECRET for .env. */
export function newSecret() {
  return crypto.randomBytes(32).toString('hex');
}
