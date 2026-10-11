# Handoff

**Last updated:** 2026-10-11 (Phase 1 + 2 complete; starting Phase 3)

## Goal and definition of done
Make this personal blog ("ripples" concept) clearly **richer, deeper and more premium** while staying soft,
calm and neutral (not themed around the owner's advocacy topics). Evolve the existing concept — do not replace
it. Upgrade the owner's own MCP (`Personal-MCP---UI-UX`) with curated, sourced *dynamic/premium* design
knowledge + tools so future sessions can ask it for a critique rubric, a motion pattern, a palette, an
anti-slop check.
**Done =** blog visibly richer with ONE memorable idea, still soft; MCP upgraded + runs; all work committed on
branches; this file current.

## Current status
Phase 1 (orient) and Phase 2 (diagnosis) are complete and verified in a real browser. Phase 3 (MCP upgrade)
starts now. Nothing in either repo has been redesigned yet — only planning + the QA harness exist.

## Repo map (both repos live under the workspace root)
Workspace root: `/Users/markelysalinas/Desktop/GIT/Personal-Blog` (not a git repo itself)
- `Personal-Blog/` — the blog repo. Branch **main** → work on **`design/pond-depth`**.
  - `blog-template-v3.html` — **the entire blog**: one 241-line file. Data (`POSTS`), router, views,
    ripple canvas, animations, all CSS. No build step, no framework, no deps (2 Google Fonts only).
  - `Start` — empty file, committed in `1c0a0a7`, deleted in the working tree by the user. Left untouched.
  - `handoff.md` — this file.
- `Personal-MCP---UI-UX/` — the owner's MCP repo. Branch **main** → work on **`feat/design-playbook`**.
  - `src/index.ts` — server + all 14 tool registrations.
  - `src/{concepts,critic,lint,rules,brief,config,jobs,sampling,usage,types}.ts`
  - `src/builder/{build,plan,prompts,scaffold,files,fonts}.ts`, `src/providers/*` (anthropic/openai/google/session/manual)
  - `src/test/{run,gates,server,weight}.ts` — Playwright + axe gates
  - `smoke/*.mjs` — keyless stdio test suite (`npm test`); `smoke/call.mjs <tool> '[json]'` calls one tool.
- `.work/` — **local scratch, belongs to neither repo**: `qa.mjs` (Playwright screenshot + measure harness),
  `shots/` (screenshots). Not committed anywhere.

## How to run / verify
```bash
# blog (static single file) — server already running as PID 3888 on port 8137
cd Personal-Blog && python3 -m http.server 8137 --bind 127.0.0.1
# then: http://127.0.0.1:8137/blog-template-v3.html#/   (#/post/<slug>, #/about)

# real-browser screenshots + overflow/console check (all widths at once)
node .work/qa.mjs .work/shots          # writes .work/shots/*.png + prints overflow & console errors

# MCP
cd Personal-MCP---UI-UX && npm run build && npm test      # 15-check keyless stdio suite
DESIGN_MCP_PROJECT_DIR=<dir> node smoke/call.mjs <tool> '[json]'
```

## Diagnosis: why it feels empty (Phase 2)
Measured/critiqued from real desktop 1440x900 + mobile 390x844 screenshots, not from code alone.

1. **No depth or horizon — the single biggest gap.** The home page is one flat field of `#E9E6F3` with three
   pastel blobs on it. Everything sits on the same z-plane; nothing is behind or in front. The code comment
   says "the home page is a quiet pond", but no water is ever drawn. It reads as *pastel shapes on a
   background*, not as a space.
2. **The signature idea leaves no trace.** Of the whole "ripples" concept, the only persistent evidence is a
   1.5px indigo ring that fades out in under a second. Ripples are not *written into* anything, so for a
   visitor who does not move the pointer (and in any still) the idea does not exist at all. Nothing accumulates.
3. **Flat rhythm.** Home is hero → lede → pills → grid; every blob is the same 1:1 aspect ratio, same padding,
   same shape family, same vertical rhythm. About is an h1 plus one paragraph followed by ~500px of nothing
   (docHeight == viewport). Posts are a stack of identical paragraph blocks. No loud/quiet alternation.
4. **Typography has one voice.** Display face at 144px on home, but the lede *also* uses the display face, so
   the serif reading voice (Literata) never appears on the home page at all. No kicker, no label/caption
   scale, no numerals scale, no optical contrast. Reading measure is 38rem serif ≈ 85 characters/line (too wide;
   60–75 is the readable band). The "pull quote" is just a heavier heading, with no treatment of its own.
5. **No texture or material.** One soft radial highlight per blob; no grain, no edge, no surface quality.
   Water with no surface is just a shape.

Minor real defects found while looking (all VERIFIED in the browser):
- The `:focus-visible{outline:3px solid #5B58C9}` rule on `main#app` leaks as a **full-width indigo rule under
  the nav on every page** (visible in every screenshot). `main{outline:0}` loses the specificity fight and
  `app.focus()` runs on every route change. Needs a proper fix + a real skip link.
- No skip link; `main` is the programmatic focus target with no visible-purpose ring.
- `.blob:hover .ex` reveals the excerpt via `max-height` → layout shift on hover; the text can also spill past
  the blob's curved edge.
- Mobile collapses per-post identity: `.blob{width:min(100%,22rem)!important}` kills the per-post width
  variance, so every post looks identical on phones.
- Per-post colour is `TINTS[hash(slug) % 6]`, so two posts can land on nearly the same tint — "one colour per
  post" is not actually guaranteed.
- `drift()` adds a new global `pointermove` listener on every home render and is never removed by `render()`
  (only `document.onscroll` is cleaned up) → listener accumulates across navigations.
- The subscribe form always answers "Thanks, you are subscribed." It is an honest TODO placeholder, but the
  copy claims something untrue; must not ship as-is.
- Post page has no next/previous post and no sense of place in the site.

## Decisions + why
- **The ONE bold idea: give the pond real water.** A persistent, cheap canvas *water surface* behind the
  content: a slow ambient swell (so the page is alive without input), ripples that are **written into** a
  decaying displacement field and therefore **linger and accumulate** (so the signature idea becomes visible
  and leaves a memory), and per-post **depth** that makes each post shape feel suspended at its own distance
  under the surface. This implements the concept the owner already loves instead of adding a new one, and it
  attacks gap #1 and #2 directly. Everything else stays quiet: craft in spacing, type, timing and layering.
- Rejected as the bold idea: a WebGL/shader rewrite (heavy dep, battery, and the owner asked for soft + calm);
  a scroll-driven "descent" narrative (would fight the calm); more decoration on the blobs (the owner
  explicitly does not want more of the same decoration).
- Keep exactly as-is (owner's stated favourites): soft watery pastel palette, pointer ripple rings + bigger
  click ripple, drifting morphing per-post shapes, hero letters that swell toward the pointer, colour-circle
  page transition, margin notes, text highlighter, copy-quote, scroll-progress ring.
- **Owner's rejections to respect:** a cobalt/yellow high-contrast version was rejected as too harsh → the
  palette stays soft; no neon; no harsh colour fields.
- Stay **single-file, data-driven**: adding a post must remain a data edit (`POSTS` array), never a layout
  edit. No build step, no framework, no new runtime dependency for the blog.
- MCP: new design-knowledge tools will be **pure data, keyless and offline** so any future session (or a
  host without API keys) can use them with zero setup. Existing API-backed tools stay untouched.
- The MCP repo commits `node_modules/` (only 2 packages) — that is why `npm ls` was broken; `npm install`
  fixed it locally. Do not commit the re-installed tree wholesale; commit source + `package.json` only.

## Next steps (ordered, smallest first)
1. **MCP branch + curated knowledge module** (`src/playbook/*.ts`): motion patterns, palette recipes +
   contrast maths, type systems, layout archetypes, anti-slop checklist, critique rubric, a11y/perf floor.
   Every entry carries a source URL + licence + what was changed.
2. **MCP tools**: `playbook` (topic lookup), `palette_check` (contrast + softness verdicts),
   `critique_rubric`, `antislop_check` (scan a file/string for slop defaults). Verify with `npm run build`,
   `npm test`, and `smoke/call.mjs` per new tool.
3. **Blog step A (defects)**: kill the focus-ring leak, add a skip link, narrow the reading measure, clean up
   the pointer listeners, make the subscribe copy truthful. Verify: `node .work/qa.mjs`, keyboard tab-through,
   screenshot diff.
4. **Blog step B (type + rhythm)**: add a label/caption scale + numerals, give the serif a real role on home,
   add a footer/colophon so the page has a bottom, vary spacing between sections. Verify: screenshots at both
   widths + measure font sizes/families in-browser.
5. **Blog step C (the bold idea — water surface)**: ambient swell, lingering/accumulating ripples written into
   a decaying field, per-post depth, shapes feel submerged; idle + off-screen rAF shutdown; `prefers-reduced-
   motion` renders a calm static surface. Verify: screenshots, interaction probe, frame budget, reduced-motion.
6. **Blog step D (post page craft)**: anchored margin notes, real pull-quote treatment, next/previous post,
   make the progress ring read as depth. Verify: post with/without notes, 0/1/many posts, long titles.
7. **Phase 5**: full verify matrix + report. Update this file.

## Gotchas / known issues
- Chrome's `--headless --screenshot` CLI **lies at narrow widths** (it laid out wider than 390px and cropped,
  which faked a mobile overflow bug). Always use `.work/qa.mjs` (Playwright) for width-sensitive checks.
- `preview_screenshot` in this environment fails ("webview is not being composited") — use `.work/qa.mjs`.
- The blog server dies if started with shell backgrounding inside a SYNC command; run it as a real
  BACKGROUND process.
- `main#app` receives focus on every route change → any focus style there is visible site-wide.
- Fonts load from Google Fonts; offline the page falls back to system-ui/Georgia (only affects screenshots).

## Do-not list
- Do not delete posts or content. Do not force-push or rewrite history.
- Do not add a heavy dependency or a build step to the blog.
- Do not make the palette harsh/high-contrast/neon.
- Do not replace the "ripples" concept with a different metaphor.
- Do not commit `node_modules/` re-installs, `.DS_Store`, or the workspace `.work/` folder.
- Do not commit the user's pending deletion of `Start` without asking (guardrail: no destructive actions).

## Sources used (URL + licence + what changed)
- None adopted yet. Anything adapted later gets a row here with URL, licence and the change made.

## Open questions for the user
- None blocking. Assumed: keeping the single-file `blog-template-v3.html` structure is acceptable (rather than
  splitting into HTML/CSS/JS or moving posts to JSON). Ask if you want that changed.
