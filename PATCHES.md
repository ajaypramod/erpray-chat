# PATCHES.md — the entire delta from upstream LibreChat

**Fork discipline** (AGENT_BUILD_INSTRUCTIONS.md §1.1): new code goes in
`client/src/erpray/`; edits to upstream files are marked `// ERPRAY-PATCH: <why>`
and kept minimal; this file lists every touched upstream file and why. Keeping the
patch surface small and enumerable is what makes a future `git merge upstream/main`
survivable instead of a week of conflict resolution.

Base: `v0.8.3` (`cfbe812d6`), forked from `danny-avila/LibreChat` (MIT).

---

## New files (no upstream conflict risk)

| File | Purpose |
|---|---|
| `client/src/components/Messages/Content/VegaLiteChart.tsx` | Renders the connector's ` ```vega-lite ` fences via `vega-embed`. Copies the `Mermaid.tsx` *pattern* (dedicated component, hooked into the same `code` router) without its 850 lines of diagram-specific zoom/pan/dialog machinery — a chart the connector already sized doesn't need it. Debounces render attempts (250ms) because the connector streams markdown in ~40-char chunks and a partial JSON fence would otherwise flash an error before snapping to the finished chart — the same problem `Mermaid.tsx` solved with `useDebouncedMermaid`. |
| `client/src/erpray/Wordmark.tsx` | The ONE place the two-tone `ERP`+`ray` wordmark and the tagline render. BRAND_GUIDE.md §1.1's whole point is that a single flat-color "ERPray" is a brand bug — funnelling every render through one component is what stops a second, un-synced, flat-colored copy from quietly appearing somewhere. |
| `client/src/erpray/theme.css` | Ink & Ray color tokens (BRAND_GUIDE.md §2) + Geist font imports. Overrides `.dark`'s semantic CSS custom properties with literal hex values — see the file header for why the shared `--gray-*` ramp is deliberately left untouched (it's shared with light mode, which stays as upstream). |
| `client/public/assets/favicon.svg`, `favicon-{16,32}x{16,32}.png`, `apple-touch-icon-180x180.png` | The block+beam mark (BRAND_GUIDE.md §5), rasterized from the SVG source via `sharp` (dev-only, not shipped) so the PNGs are pixel-exact renders of the same geometry as `Wordmark.tsx`'s icon, not a hand-drawn approximation. |
| `client/src/erpray/FollowupChips.tsx` + `.spec.ts` | Parses the connector's trailing `**Next:** \`chip\` · \`chip\`` line out of the markdown and renders it as real, clickable pill buttons instead. `parseChips()` is a pure function, unit-tested against a STRING LITERALLY CAPTURED from running `toMarkdown(composeAnswer(...))` in erpray-app/packages/core (2026-07-15) — not a hand-guessed approximation of the format, which could have passed forever while the real integration silently broke. 7/7 green. Also: this one patch replaces all 11 of SyteRay's old per-message action buttons (AGENT_BUILD_INSTRUCTIONS.md §5.4) — those were only canned prompt triggers, which is exactly what this does, generically, driven by the connector's own answer contract. |

## Edited upstream files

| File | Change | Why |
|---|---|---|
| `client/src/components/Chat/Messages/Content/MarkdownComponents.tsx` | Added an `isVegaLite` branch to both `code` and `codeNoExecution`, identical in shape to the existing `isMermaid` branch. | This is the ONE place fenced code blocks are routed by language tag — adding a second routing mechanism elsewhere would be exactly the "N unsynchronised copies" bug class the connector's own code repeatedly warns against. |
| `client/src/components/Chat/Messages/Content/Markdown.tsx` | Runs `parseChips()` on the message content before feeding it to `ReactMarkdown`; renders `<FollowupChips>` after it. | The single point every non-user message's markdown flows through (`MessageContent.tsx` routes `!isCreatedByUser` here, `MarkdownLite` for the user's own messages — chips only ever appear in connector answers, so only this file needed the patch). |
| `client/package.json` | Added `vega`, `vega-lite`, `vega-embed` as direct dependencies, version-pinned; `@fontsource/geist-sans`, `@fontsource/geist-mono`. | See "The vega-embed version trap" below. Fontsource packages are self-hosted (SIL OFL-1.1), no CDN. |
| `client/src/main.jsx` | One import line: `./erpray/theme.css`, placed after `./style.css`. | The entire hook point for the color/font override — see `theme.css`'s own header for why it lives in a new file rather than editing `style.css` in place. |
| `client/index.html` | Title, meta description, favicon links, `theme-color`, and the pre-paint loading-screen background color/default. | These render BEFORE React mounts — a patch that only touched the React layer would leave a LibreChat-branded flash on every cold load. |
| `client/src/routes/Layouts/Startup.tsx`, `client/src/components/Agents/Marketplace.tsx` | `document.title` / page-title fallback strings, `'LibreChat'` → `'ERPray'`. | The only two places a hardcoded fallback name reaches the tab title once `startupConfig` has loaded. |
| `client/src/components/Auth/AuthLayout.tsx` | Replaced the plain `<img src="assets/logo.svg">` login-page logo with `<Wordmark withMark /><Tagline />`. | The first screen every user ever sees. BRAND_GUIDE.md §1.1 rule 7 names exactly this kind of introductory placement as where tagline adjacency matters most. |
| `packages/client/src/theme/context/ThemeProvider.tsx` | `getInitialTheme()`'s no-stored-preference fallback: `'system'` → `'dark'`. | BRAND_GUIDE.md §7.1: "Ink background is the default everywhere public-facing." Upstream's `'system'` default means a first-time visitor on a light-OS machine sees a light, un-branded app. A user who explicitly picks "system" from the switcher still gets exactly that — this only changes the very first paint. **Must stay in sync with the identical default in `client/index.html`'s inline script** (both are documented with a cross-reference comment) — that script paints before React mounts, so if the two ever disagree, a first-time visitor sees one background flash into another. |

---

## The vega-embed version trap — read this before touching these three versions

`vega-embed@7.x` ships **ESM-only**, with a package.json `"exports"` map and **no
top-level `main`/`types` fields**. This project's `tsconfig.json` uses
`"moduleResolution": "node"` (the classic algorithm), which **does not read
`exports` maps at all** — so `vega-embed@7` typechecks as `Cannot find module`,
even though it is correctly installed.

Fixing this by switching the whole monorepo to `"moduleResolution": "bundler"` (or
`node16`/`nodenext`) would be invasive and risky in a codebase this large, for a
problem one dependency has.

**So: pinned to `vega-embed@^6.26.0`**, the last line that still ships classic
`main`/`types` fields alongside the modern `exports` map — it satisfies both
resolution algorithms.

**And `vega-embed`'s own `peerDependencies` are a second trap**: it declares
`vega: ^5.21.0` but `vega-lite: '*'` — an unbounded wildcard. Installing
`vega-embed` alone lets npm resolve `vega-lite` to its own latest major (6.x),
which itself requires `vega@^6.0.0` — directly contradicting vega-embed's own
`^5.21.0` peer, and `npm install` correctly refuses with `ERESOLVE`.

**Fix: all three are pinned together, explicitly** — `vega@^5.30.0`,
`vega-lite@^5.23.0`, `vega-embed@^6.26.0` — a combination verified to install
clean and typecheck clean. **Do not bump `vega-embed` past 6.x, and do not let
`vega-lite` drift to 6.x, without re-verifying this whole chain.**

All three: **BSD-3-Clause** — permissive, no license concern.

---

## Not yet done (see erpray-app/RESUME.md for the full remaining list)

- `FollowupChips.tsx`
- `librechat.yaml` wiring / titleModel guard
- Artifact-iframe sandbox-fetch verification
- The 5 role personas as LibreChat Agents; the skill library as Prompts
- `customFooter` config value (server-side; `client/src/components/Chat/Footer.tsx`
  already reads it, crediting LibreChat's MIT license — no code patch needed, only
  a `librechat.yaml`/interface-config value, tracked under the librechat.yaml task)
