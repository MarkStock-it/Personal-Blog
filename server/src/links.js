/**
 * Signed links, in one place.
 *
 * Both the confirmation link and the unsubscribe link carry `?e=<address>&t=<token>`, where the token
 * is an HMAC of `<kind>:<address>` keyed by SESSION_SECRET. Without it anyone could confirm — or
 * remove — anybody else's address by guessing it; with it only a link this server minted for that
 * exact address and purpose works. Nothing is stored to mint a link: the token is derived, so there
 * is no table of pending requests to leak or clean up, and a link cannot be forged by reusing one
 * from a different kind.
 *
 * Addresses travel in the URL (they are the subscriber's own, in mail sent to them), so the routes
 * serving these links send `no-store` and never leak the query onward in a Referer header.
 */
import crypto from 'node:crypto';

import { safeEqual } from './auth.js';

export const LINK_KINDS = ['confirm', 'unsubscribe'];

const normalise = email => String(email ?? '').trim().toLowerCase();

const isKind = kind => LINK_KINDS.includes(kind);

/** The token for one address and one purpose, or '' when there is nothing to sign yet. */
export function linkToken(kind, email, secret) {
  const address = normalise(email);
  if (!isKind(kind) || !address || !secret) return '';
  return crypto.createHmac('sha256', secret)
    .update(`${kind}:${address}`)
    .digest('base64url');
}

/** True only for a token this server issued, for this address, for this purpose. Never throws. */
export function verifyLink(kind, email, token, secret) {
  if (typeof token !== 'string' || token === '') return false;
  const want = linkToken(kind, email, secret);
  if (!want) return false;
  // safeEqual hashes both sides first, so the comparison is constant-time whatever the input length.
  return safeEqual(token, want);
}

/** The whole link, ready to put in an email. '' when any part of it is missing. */
export function linkUrl(kind, path, email, { siteUrl = '', secret = '' } = {}) {
  const address = normalise(email);
  const token = linkToken(kind, address, secret);
  const base = String(siteUrl || '').replace(/\/+$/, '');
  if (!address || !token || !base) return '';
  return `${base}${path}?${new URLSearchParams({ e: address, t: token })}`;
}
