/**
 * A small fixed-window rate limiter, in memory.
 *
 * Why in memory and not a table: this is one process on one host, the limits are about bursts rather
 * than long-run accounting, and a database write per request would be the more expensive half of the
 * thing it is defending. A restart clears the counts, which is a fair trade for a personal site.
 *
 * Entries expire logically, but a Map that is never swept grows for every address that ever appears —
 * a trivial memory exhaust. `hit` therefore sweeps once the map passes `pruneAt`.
 *
 * Two boundaries, because they answer different questions:
 *   - `hit(key)`   records an event and says whether it was within the budget (`n <= max`).
 *   - `check(key)` asks whether there is room for one more without recording anything (`n < max`).
 */
export function createLimiter({ windowMs, max, pruneAt = 1000, now = Date.now } = {}) {
  if (!(windowMs > 0) || !(max > 0)) throw new Error('a limiter needs a positive window and max');
  const hits = new Map();                        // key -> { n, until }
  let sinceSweep = 0;

  function sweep(t) {
    for (const [key, entry] of hits) {
      if (t > entry.until) hits.delete(key);
    }
  }

  /* Sweeping on every hit while the map is large would make each request cost the size of the map,
     which is a denial of service dressed as a defence. It runs at most once every `pruneAt` hits
     instead, so the cost is amortised. Live entries cannot be dropped early without losing their
     count, so the floor under the map is the number of distinct keys seen inside one window. */
  function maybeSweep(t) {
    sinceSweep += 1;
    if (hits.size > pruneAt && sinceSweep >= pruneAt) {
      sinceSweep = 0;
      sweep(t);
    }
  }

  const read = (key, t) => {
    const entry = hits.get(key);
    return !entry || t > entry.until ? { n: 0, until: t + windowMs } : entry;
  };

  return {
    /** Record one event. `allowed` is false once the budget for this window is used up. */
    hit(key) {
      const t = now();
      maybeSweep(t);
      const entry = read(key, t);
      entry.n += 1;
      hits.set(key, entry);
      return { n: entry.n, allowed: entry.n <= max, retryAfterMs: Math.max(0, entry.until - t) };
    },
    /** Look without recording: is there room for one more in this window? */
    check(key) {
      const t = now();
      const { n, until } = read(key, t);
      return { n, allowed: n < max, retryAfterMs: Math.max(0, until - t) };
    },
    /** Forget a key — used when an attempt succeeds, so a correct sign-in clears the failures. */
    clear(key) {
      hits.delete(key);
    },
    size() {
      return hits.size;
    },
  };
}

/** Whole seconds, for a Retry-After header. Never less than one. */
export const retryAfterSeconds = ms => Math.max(1, Math.ceil(ms / 1000));
