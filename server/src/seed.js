/**
 * The three placeholder posts from the static template, expressed as Markdown so they survive the
 * move to the database. They are written only into an empty posts table (see migrate.js), so this
 * file never overwrites real writing.
 *
 * They are seeded as DRAFTS. A fresh install must never show a visitor template text, and a draft is
 * visible in the writing room exactly where the owner will look for their own words.
 */
export const SEED_POSTS = [
  {
    slug: 'first-post',
    title: 'Placeholder title that says the thing plainly',
    date: '2026-10-01',
    topic: 'Essays',
    excerpt: 'A two-line preview that tells the reader what they will walk away with.',
    depth: 0.22,
    published: false,
    body: `Opening paragraph. Select any sentence to highlight it or copy it as a quote.

NOTE: A margin note: say what you really think, add context, or cite a source.

Second paragraph of the argument.

> A pull quote that carries the post.

Closing paragraph.

NOTE: Another aside. Notes are optional.`,
  },
  {
    slug: 'second-post',
    title: 'A shorter note on something smaller',
    date: '2026-09-15',
    topic: 'Notes',
    excerpt: 'Not every post needs to be long.',
    depth: 0.58,
    published: false,
    body: 'Short post body.',
  },
  {
    slug: 'third-post',
    title: 'Another thought worth writing down',
    date: '2026-08-30',
    topic: 'Essays',
    excerpt: 'Placeholder preview text.',
    depth: 0.4,
    published: false,
    body: 'Body text.',
  },
];
