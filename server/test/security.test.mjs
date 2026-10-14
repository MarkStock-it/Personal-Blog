/**
 * Tests for the response headers and the policy that guards the pages' own scripts.
 *
 * The important ones are the anti-framing headers: /confirm and /unsubscribe each carry one button
 * that changes something, and the same-origin check on their POST cannot stop a page that frames them
 * and tricks the click — that request really does come from this origin. So `frame-ancestors 'none'`
 * and `X-Frame-Options: DENY` are the defence, and they are pinned here.
 *
 * The other half is the nonce: the pages carry their behaviour in inline scripts, which is exactly
 * what `'unsafe-inline'` would allow an injected script to do as well. `script-src` names a fresh
 * nonce per response and nothing else, so these tests pin both the nonce and the fact that
 * `'unsafe-inline'` is gone from script-src — the token that made the policy decorative.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { security, securityHeaders, cspFor, newNonce, trustProxySetting } from '../src/security.js';

/** A response that only remembers what was set on it. */
const fakeRes = () => {
  const headers = {};
  return {
    headers,
    locals: {},
    set(name, value) { headers[name] = value; return this; },
  };
};

test('the pages refuse to be framed, and refuse to be sniffed', () => {
  const res = securityHeaders(fakeRes());
  assert.equal(res.headers['X-Frame-Options'], 'DENY');
  assert.match(res.headers['Content-Security-Policy'], /frame-ancestors 'none'/);
  assert.equal(res.headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(res.headers['Referrer-Policy'], 'strict-origin-when-cross-origin');
});

test('the response is isolated from other documents, and the unused sensors are switched off', () => {
  const res = securityHeaders(fakeRes());
  assert.equal(res.headers['Cross-Origin-Opener-Policy'], 'same-origin');
  assert.match(res.headers['Permissions-Policy'], /camera=\(\)/);
  assert.match(res.headers['Permissions-Policy'], /geolocation=\(\)/);
  assert.match(res.headers['Permissions-Policy'], /payment=\(\)/);
});

test('no HSTS is set from the app', () => {
  /* It belongs to the TLS terminator: an includeSubDomains pin issued from one vhost on a shared
     domain could force https on other people's subdomains. */
  const res = securityHeaders(fakeRes());
  assert.equal(res.headers['Strict-Transport-Security'], undefined);
});

test('the policy closes the doors the app never uses', () => {
  const csp = cspFor('abc123');
  for (const directive of ["default-src 'self'", "object-src 'none'", "base-uri 'none'", "form-action 'self'", "connect-src 'self'"]) {
    assert.ok(csp.includes(directive), `the policy is missing ${directive}`);
  }
});

test('script-src allows this page’s nonce and nothing inline', () => {
  const csp = cspFor('abc123');
  assert.match(csp, /script-src 'self' 'nonce-abc123'/);
  assert.equal(/script-src[^;]*'unsafe-inline'/.test(csp), false, 'script-src must not allow inline');
});

test('style-src keeps unsafe-inline and takes no nonce', () => {
  /* A nonce on style-src would make the browser ignore 'unsafe-inline', and a nonce does not cover
     `style="..."` attributes — which the markup uses. So this one is deliberate. */
  const csp = cspFor('abc123');
  assert.match(csp, /style-src 'self' 'unsafe-inline' https:\/\/fonts\.googleapis\.com/);
  assert.equal(/style-src[^;]*nonce/.test(csp), false, 'a nonce here would strip style attributes');
});

test('the policy still allows what the site actually loads', () => {
  const csp = cspFor('abc123');
  assert.match(csp, /font-src https:\/\/fonts\.gstatic\.com/);
  assert.match(csp, /img-src 'self' data:/);
  assert.match(csp, /style-src 'self' 'unsafe-inline'/);
});

test('the header and the page are given the same nonce, and it is remembered for the templates', () => {
  const res = securityHeaders(fakeRes());
  const nonce = res.locals.cspNonce;
  assert.ok(nonce && nonce.length >= 20, 'a nonce of real length');
  assert.equal(res.headers['Content-Security-Policy'], cspFor(nonce));
});

test('two responses never share a nonce', () => {
  const seen = new Set();
  for (let i = 0; i < 50; i += 1) {
    const res = securityHeaders(fakeRes());
    assert.equal(seen.has(res.locals.cspNonce), false, 'nonces must not repeat');
    seen.add(res.locals.cspNonce);
  }
  assert.equal(seen.size, 50);
  assert.notEqual(newNonce(), newNonce());
});

test('a nonce is safe to put in an attribute', () => {
  for (let i = 0; i < 50; i += 1) assert.match(newNonce(), /^[A-Za-z0-9_-]+$/);
});

test('the middleware sets the headers and passes the request on', () => {
  const res = fakeRes();
  let called = 0;
  security({}, res, () => { called += 1; });
  assert.equal(called, 1, 'the request continues');
  assert.equal(res.headers['Content-Security-Policy'], cspFor(res.locals.cspNonce));
  assert.equal(res.headers['X-Frame-Options'], 'DENY');
});

/*
 * Where req.ip comes from decides who a rate limit counts, so these cases are the other
 * security-critical half of this file. The unset case is the one that bit us: an unset TRUST_PROXY
 * used to parse as 0, i.e. believe nothing, which behind the proxy would have bucketed every visitor
 * on earth as 127.0.0.1 — five signups per ten minutes for the whole site, and one attacker locking
 * out every login.
 */
test('an unset TRUST_PROXY trusts the proxy when we listen on loopback, and nothing otherwise', () => {
  assert.equal(trustProxySetting(undefined, '127.0.0.1'), 1);
  assert.equal(trustProxySetting('', 'localhost'), 1);
  assert.equal(trustProxySetting('  ', '::1'), 1);
  assert.equal(trustProxySetting(undefined, '0.0.0.0'), false, 'a public listener has no proxy in front');
  assert.equal(trustProxySetting(undefined, '192.168.1.10'), false);
});

test('an explicit TRUST_PROXY always wins over the default', () => {
  assert.equal(trustProxySetting('off', '127.0.0.1'), false);
  assert.equal(trustProxySetting('0', '127.0.0.1'), false);
  assert.equal(trustProxySetting('FALSE', '127.0.0.1'), false);
  assert.equal(trustProxySetting('loopback', '0.0.0.0'), 'loopback');
  assert.equal(trustProxySetting('2', '127.0.0.1'), 2);
  assert.equal(trustProxySetting('1', '0.0.0.0'), 1);
});

test('nonsense falls back to the listener instead of throwing', () => {
  assert.equal(trustProxySetting('yes-please', '127.0.0.1'), 1);
  assert.equal(trustProxySetting('-1', '0.0.0.0'), false);
  assert.equal(trustProxySetting(undefined, undefined), false);
});
