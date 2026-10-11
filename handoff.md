# Handoff

**Last updated:** 2026-10-11. All five phases (orient, diagnose, upgrade the MCP, apply, verify) are complete.

## Goal and definition of done
Make the blog (concept: "ripples") clearly richer, deeper and more premium while staying soft, calm and
neutral, and upgrade the owner's own MCP with curated, sourced dynamic-design knowledge so future sessions
can ask it for a rubric, a motion pattern, a palette and an anti-slop check. **Done =** blog visibly richer
with one memorable idea; MCP upgraded and running; everything committed on branches; this file current.
**Status: complete, with the caveats listed under "Not done / not verified".**

## Current status
Both repos are on feature branches and committed. The blog has real water (see Decisions), the MCP has a
17-entry-per-topic design playbook plus six new tools, ten resources and two prompts, and the whole blog
was verified in a real browser at 390/1440, with keyboard, reduced motion and axe. All verification
harnesses are listed below and all currently pass.

## Repo map
- Workspace root `/Users/markelysalinas/Desktop/GIT/Personal-Blog` is not itself a repo. `.work/` there is
  **local scratch, committed nowhere** (see "How to verify" — nothing else depends on it).
- `Personal-Blog/` (branch **`design/pond-depth`**): `blog-template-v3.html` is the **entire blog** — one
  file, no build step, no framework, two Google Fonts. `handoff.md` is this file. `Start` is an empty file
  the owner deleted in the working tree; left untouched, not committed.
- `Personal-MCP---UI-UX/` (branch **`feat/design-playbook`**): `src/index.ts` (20 tools, 10 resources,
  2 prompts), `src/playbook/*` (the offline knowledge; `types.ts` is the contract), `src/test/gates.ts`
  (the automated gates), `smoke/smoke.mjs` (55 checks). `dist/` is committed because hosts run it directly.

## How to verify (all commands are exact; VERIFIED this session)
```bash
# blog server (must be a real BACKGROUND process; shell backgrounding in a SYNC call gets cleaned up)
cd Personal-Blog && python3 -m http.server 8137 --bind 127.0.0.1
# fixtures server, for the 0/1/many/long-title cases
cd .work/fixtures && python3 -m http.server 8138 --bind 127.0.0.1     # (workspace root)

node .work/make-fixtures.mjs     # regenerate fixtures from the real file — rerun after editing the blog
node .work/qa.mjs .work/shots    # desktop+mobile screenshots + console + overflow report
node .work/probe-water.mjs       # the water: paint, idle throttle, hidden tab, linger/decay, frame cost, reduced motion
node .work/verify-blog.mjs       # edge cases, metadata, skip link, keyboard focus, axe, reduced motion

cd Personal-MCP---UI-UX && npm run build && npm test    # 55-check keyless stdio suite
node .work/validate-playbook.mjs                        # contract check over the compiled playbook
DESIGN_MCP_PROJECT_DIR=<dir> node smoke/call.mjs palette_check '{"colours":["#E9E6F3","#2B2742"]}'
```
The three `.work/*.mjs` harnesses need `playwright` — they resolve it from the MCP repo's `node_modules`
(absolute path hardcoded at the top of each). **They live outside both repos, so they will not survive a
`rm -rf .work`.** If you need them long-term, move them into the blog repo under `tools/` and fix the path.

## Done (branches and commits)
- `Personal-Blog` @ **design/pond-depth**: `10f830a` baseline (tracked the existing file + added handoff.md),
  `b78e674` the redesign (water, depth, type system, and eight measured fixes).
- `Personal-MCP---UI-UX` @ **feat/design-playbook**: `91a9691` agent notes + gitignore, `db8b3ef` the
  playbook module, `32bf034` tools/resources/prompts + smoke coverage, `e997666` palette_check pairing fix,
  `27a5a2a` two playbook entries corrected after applying them to real code.

## Decisions + WHY
- **The one bold idea: give the pond real water.** One fixed canvas paints slow bands of light and shade
  from a seeded noise field, and pointer input is written into a decaying 24-impulse pool so ripples linger,
  interfere and calm down in ~1.5s. Each post has a `depth` driving drift, scale, blur and tint. Rationale:
  the concept was named in a comment but never drawn, and the previous one-shot ring left no trace, so for a
  passive reader the whole idea did not exist. This implements the concept the owner already likes instead of
  adding a new metaphor. Rejected: a WebGL/shader surface (weight, battery) and a scroll-driven descent
  (fights the calm).
- **The text layer is never blurred, translucent or scaled by depth's material.** Depth is atmosphere;
  legibility is the floor. (playbook: `organic/submerged-depth-layering`)
- **Ambient drift runs continuously for fine pointers only** and repaints at 15Hz when idle (60Hz while the
  pointer is active). A touch device draws one still frame and answers taps with a ripple, then goes static.
  This is a deliberate deviation from `motion/ambient-idle-loop`, which says decay to zero and cancel the
  frame: here the surface *is* the design, so an invisible surface would defeat the work. Measured cost is
  in the report; hidden tabs stop entirely.
- **Excerpts are always visible and clamped**, instead of revealed by animating `max-height` (that shifted
  layout on hover). **Pond titles clamp to 3 lines**; the full text stays in the DOM and on the post page.
- Owner's favourites kept intact: soft watery pastels, pointer rings + bigger click ripple, morphing shapes
  that drift, hero letters that swell, colour-circle transition, margin notes, highlighter, copy-quote,
  scroll-progress ring. Owner's rejection respected: no harsh/neon/high-contrast colour fields.
- Tints are assigned **farthest-first** (minimum hue distance) rather than `hash % 6`, which had allowed two
  posts to land on nearly the same colour.
- MCP playbook entries are **original prose with sources recorded for provenance**; nothing was adapted from
  a no-derivatives source. New tools are pure data/offline so they work with no API keys.

## Next steps (ordered, smallest first)
1. Open `http://127.0.0.1:8137/blog-template-v3.html#/` with a real mouse and judge the water live — a still
   screenshot under-sells it, and this is the one thing no harness can judge for you.
2. Replace the placeholder content: the name, the hero statement (`viewHome`), the lede, the About copy and
   all three posts. The design is data-driven: adding a post is adding an object to `POSTS`.
3. Decide on the two open questions below (`index.html`, and whether to commit the harnesses).
4. Implement the remaining `TODO`s still in the file (search, loadPosts, RSS, highlight persistence,
   save-quote-as-image, more pages). Each is marked in place.
5. Optional: run `design_playbook` / `critique_rubric` from the MCP on the finished page for a second opinion.

## Not done / not verified
- **Not verified:** the water's feel with a real mouse on a real GPU. All measurements are headless software
  rendering (p95 16.8ms during a sweep — the gates' budget is 34ms), and the ambient surface is authored to
  be very subtle, so both want a human eye.
- **Not done:** real URLs instead of `#hash` (SEO), pagination/search for many posts, RSS, per-post highlight
  persistence, save-quote-as-image, more nav pages, an About portrait/contact, a real newsletter integration.
- **Not done:** the MCP's API-backed pipeline (concepts/build/test/critique) was not exercised — it needs keys
  and a target project. The keyless suite and the six new offline tools are covered.

## Gotchas and known issues
- Chrome's `--headless --screenshot` CLI **mis-lays-out at narrow widths** (it cropped at 390px and faked a
  mobile overflow bug). Always use `.work/qa.mjs`.
- The Preview tab cached the old file once when `preview_navigate` did not revalidate; bust it with `?v=N`.
- Python's http.server dies if backgrounded inside a SYNC command; use a real background process.
- `main#app` receives focus on every in-app navigation, so any focus style there is visible site-wide. The
  file sets `main:focus{outline:none}` on purpose and provides a skip link instead; on the **first** render
  focus is deliberately not moved, or the skip link would be unreachable by Tab.
- `body::after` grain needs `feColorMatrix saturate 0`: `feTurbulence` is per-channel and is otherwise
  coloured speckle.
- The blog serves fonts from Google Fonts; offline it falls back to system-ui/Georgia.

## Do-not list
- Do not delete posts or content; do not force-push or rewrite history.
- Do not add a heavy dependency or a build step to the blog; it must stay one file.
- Do not make the palette harsh, neon or high-contrast.
- Do not replace the "ripples"/water concept with a different metaphor.
- Do not commit the owner's pending `Start` deletion, `node_modules` re-installs, `.DS_Store`, or `.work/`.
- Do not put secrets or API keys in code or in this file.

## Sources used
**Nothing was copied or adapted.** Everything is original prose; sources are recorded so an entry can be
checked, and restrictive ones are cited rather than paraphrased. Recorded per entry in
`src/playbook/*.ts`, each with URL, licence and a change note. Licences actually involved:
- Adaptable (recorded as consulted, `adapted: false`): web.dev / Google developer docs (CC BY 4.0),
  Material Components and IBM Carbon repositories (Apache-2.0), Motion (MIT), Robert Penner's easing set
  (BSD-3-Clause/MIT), NVIDIA GPU Gems ch.1 (proprietary, cited only), Apple HIG (proprietary, cited only),
  MDN (CC BY-SA 2.5+, cited only), W3C/WAI (no derivatives permitted, cited only), GSAP docs, Fluent 2,
  Refactoring UI, Nielsen Norman Group (all proprietary, cited only), easings.net (GPL-3.0, not used).
- Research that shaped the MCP's shape (not content): the survey of existing design MCP servers, which found
  that motion choreography, generative canvas work, soft-palette contrast maths and a reduced-motion-plus-
  frame-budget contract were the gaps. `ux-mcp-server`'s `ux://…` resource URIs, `mcp-vibe-ui`'s `theme://…`
  resources and DB UX's workflow prompts informed the resource/prompt design; no code or text was taken.

## Open questions for the user
1. Rename `blog-template-v3.html` to `index.html` so the blog loads at `/` with real URLs? (Rename/move is
   easily reversible but it changes the path you have bookmarked, so it was left alone.)
2. Should the three verification harnesses in `.work/` be moved into the blog repo under `tools/` so they
   survive? They currently sit outside both repos and are not committed.
