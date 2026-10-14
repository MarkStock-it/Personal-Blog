/**
 * Tests for the rate limiter behind the login and the signup form.
 *
 * The clock is injected, so a window can be crossed without waiting for one. What matters here is
 * that the boundary is exactly where it says it is (the fifth signup allowed, the sixth refused),
 * that asking a question does not count as an event, and that the Map cannot grow without bound —
 * a limiter that leaks an entry per address is itself the denial of service.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createLimiter, retryAfterSeconds } from '../src/limit.js';

/** A clock the test moves by hand. */
function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: ms => { t += ms; } };
}

test('a key may act up to the limit inside the window, and not once more', () => {
  const time = clock();
  const limiter = createLimiter({ windowMs: 60000, max: 3, now: time.now });
  assert.deepEqual(
    [1, 2, 3, 4].map(() => limiter.hit('ip').allowed),
    [true, true, true, false],
  );
  const refused = limiter.hit('ip');
  assert.equal(refused.n, 5);
  assert.equal(refused.allowed, false);
});

test('the window rolls over on its own', () => {
  const time = clock();
  const limiter = createLimiter({ windowMs: 60000, max: 2, now: time.now });
  limiter.hit('ip');
  limiter.hit('ip');
  assert.equal(limiter.hit('ip').allowed, false);
  time.advance(60001);
  assert.equal(limiter.hit('ip').allowed, true, 'the budget comes back with the new window');
});

test('keys do not share a budget', () => {
  const limiter = createLimiter({ windowMs: 60000, max: 1, now: clock().now });
  assert.equal(limiter.hit('a').allowed, true);
  assert.equal(limiter.hit('a').allowed, false);
  assert.equal(limiter.hit('b').allowed, true);
});

test('check asks without spending', () => {
  const time = clock();
  const limiter = createLimiter({ windowMs: 60000, max: 2, now: time.now });
  assert.equal(limiter.check('ip').allowed, true);
  assert.equal(limiter.check('ip').n, 0, 'a question is not an event');
  limiter.hit('ip');
  limiter.hit('ip');
  assert.equal(limiter.check('ip').allowed, false, 'two spent of two');
  assert.equal(limiter.hit('ip').allowed, false);
});

test('clear forgets a key, so a correct sign-in wipes the failures', () => {
  const limiter = createLimiter({ windowMs: 60000, max: 1, now: clock().now });
  limiter.hit('ip');
  assert.equal(limiter.check('ip').allowed, false);
  limiter.clear('ip');
  assert.equal(limiter.check('ip').allowed, true);
  assert.equal(limiter.size(), 0);
});

test('retryAfterMs counts down as the window runs out', () => {
  const time = clock();
  const limiter = createLimiter({ windowMs: 60000, max: 1, now: time.now });
  limiter.hit('ip');
  time.advance(20000);
  assert.equal(limiter.check('ip').retryAfterMs, 40000);
  time.advance(40000);
  assert.equal(limiter.check('ip').retryAfterMs, 0, 'a fresh window waits for nothing');
});

test('expired keys are swept, so a flood of distinct addresses cannot accumulate', () => {
  const time = clock();
  const limiter = createLimiter({ windowMs: 1000, max: 1, pruneAt: 50, now: time.now });

  /* 1000 addresses over 5s at a 1s window: at most the last ~200 can still be live, so the map has
     to sit near that rather than near 1000. This is the property that stops the limiter itself from
     being the memory exhaust — the number of entries ever seen must not be what the map holds. */
  for (let i = 0; i < 1000; i += 1) {
    limiter.hit(`address-${i}@example.com`);
    time.advance(5);
  }
  assert.ok(limiter.size() <= 250, `bounded by the live window, saw ${limiter.size()} of 1000`);
});

test('once everything has expired the map empties out completely', () => {
  const time = clock();
  const limiter = createLimiter({ windowMs: 1000, max: 1, pruneAt: 25, now: time.now });
  for (let i = 0; i < 60; i += 1) limiter.hit(`address-${i}@example.com`);
  assert.equal(limiter.size(), 60, 'all of them are still inside the window');
  time.advance(1001);
  for (let i = 0; i < 25; i += 1) limiter.hit(`later-${i}@example.com`);   // enough hits to trigger a sweep
  assert.ok(limiter.size() <= 26, `the expired sixty were dropped, saw ${limiter.size()}`);
});

test('a limiter without a positive window or limit is a mistake, not a silent no-op', () => {
  assert.throws(() => createLimiter({ windowMs: 0, max: 5 }));
  assert.throws(() => createLimiter({ windowMs: 1000, max: 0 }));
  assert.throws(() => createLimiter({}));
});

test('Retry-After is whole seconds and never zero', () => {
  assert.equal(retryAfterSeconds(0), 1);
  assert.equal(retryAfterSeconds(1), 1);
  assert.equal(retryAfterSeconds(1500), 2);
  assert.equal(retryAfterSeconds(60000), 60);
});
