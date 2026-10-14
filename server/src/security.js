/**
 * Response headers for every page, and the nonce the pages' own scripts carry.
 *
 * The one that earns its place here is `frame-ancestors` (with `X-Frame-Options` for older clients):
 * /confirm and /unsubscribe are pages with one button that changes something, and the same-origin
 * check on their POSTs cannot stop a page that wraps them in a frame and tricks a click — the request
 * then genuinely comes from this origin. Refusing to be framed is what stops that.
 *
 * `script-src` names a fresh nonce per response and nothing else, so `<script>` blocks that this server
 * wrote can run and nothing an attacker manages to inject can. That is what makes the policy worth
 * having: the pages carry their data and their behaviour in inline scripts, so `'unsafe-inline'` used
 * to be unavoidable and would have covered an injected script just as happily.
 *
 * `style-src` still needs `'unsafe-inline'`, and a nonce would not fix it: a nonce on `<style>` does
 * not cover `style="..."` attributes, and the markup uses those (the preview pill, a couple of
 * one-off widths). A nonce in `style-src` would make the browser ignore `'unsafe-inline'` and strip
 * those attributes, so style-src deliberately has no nonce.
 */
import crypto from 'node:crypto';

/** A fresh nonce: 16 random bytes, base64url, safe to put in an attribute. */
export const newNonce = () => crypto.randomBytes(16).toString('base64url');

/** The policy for one response. */
export const cspFor = nonce => [
  "default-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  `script-src 'self' 'nonce-${nonce}'`,
  "connect-src 'self'",
].join('; ');

/**
 * What to tell Express about `trust proxy`, from TRUST_PROXY and the address we listen on.
 *
 * This decides where `req.ip` comes from, and every per-IP rate limit rests on it, so getting the
 * default wrong is expensive in both directions: believing nothing behind a proxy lumps every visitor
 * into one bucket (a handful of signups for the whole site, and one attacker locking out every
 * login), while believing a forwarded header with no proxy in front lets the client pick its own
 * identity. So: an explicit setting always wins; otherwise a loopback listener means a proxy must be
 * in front (that is how this is deployed), and a public listener means nothing is.
 */
export function trustProxySetting(raw, host) {
  const value = String(raw ?? '').trim().toLowerCase();
  if (value === 'off' || value === 'false' || value === '0') return false;
  if (value === 'loopback') return 'loopback';
  const hops = Number(value);
  if (value !== '' && Number.isInteger(hops) && hops >= 0) return hops;
  return /^(127\.|::1$|localhost)/.test(String(host ?? '')) ? 1 : false;
}

/**
 * Set the headers on a response, and remember this response's nonce on `res.locals.cspNonce` so the
 * templates can put it on their script tags. Returns the response, so it can be chained.
 *
 * HSTS is deliberately absent: it belongs to the TLS terminator, which is the only layer that knows
 * the connection is https and that a host is covered by a certificate. This app is one vhost on a
 * shared domain's wildcard, and an `includeSubDomains` pin issued from here could force https on
 * other people's subdomains.
 */
export function securityHeaders(res, nonce = newNonce()) {
  res.locals.cspNonce = nonce;
  res.set('Content-Security-Policy', cspFor(nonce));
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.set('Cross-Origin-Opener-Policy', 'same-origin');
  res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  return res;
}

export const security = (req, res, next) => {
  securityHeaders(res);
  next();
};
