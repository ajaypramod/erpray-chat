# PATCHES.md — the entire delta from upstream LibreChat

**Fork discipline** (AGENT_BUILD_INSTRUCTIONS.md §1.1): new code goes in
`client/src/erpray/`; edits to upstream files are marked `// ERPRAY-PATCH: <why>`
and kept minimal; this file lists every touched upstream file and why. Keeping the
patch surface small and enumerable is what makes a future `git merge upstream/main`
survivable instead of a week of conflict resolution.

Base: `v0.8.3` (`cfbe812d6`), forked from `danny-avila/LibreChat` (MIT).

---

## Four build-time lessons, ALL found by actually running `docker compose build`

None of these four would have been caught by `tsc --noEmit`, by the client's own
`jest` suite, or by reading the diff carefully — each needed the real, full
production build to actually run. That is the entire justification for standing
up Docker locally rather than trusting typecheck + unit tests alone.

**`tsc --noEmit` passing proves nothing about CSS.** `erpray/theme.css` shipped a
comment containing the literal two-character comment-close sequence — TWICE, the
second time while writing the comment explaining the FIRST occurrence — which
closed the CSS comment early and left the rest of the sentence as invalid CSS. Every
TypeScript typecheck in this repo passed cleanly throughout, because none of them
parse `.css` files. Only a real `vite build` (which runs PostCSS) caught it, and
only because it was actually run rather than assumed to follow from a green
typecheck. **Verify with the actual parser** (`postcss.parse()`) before trusting a
comment edit near punctuation-heavy prose, not just a regex guess at correctness.

**The Dockerfile's `RUN a; b; c` masked a build failure as success.** Upstream's
frontend-build `RUN` step chained commands with `;`, not `&&`. When `npm run
frontend` (the vite build) failed, the shell moved on to `npm prune` and `npm cache
clean` anyway — both succeeded independently, so the WHOLE layer's exit code was 0,
and Docker **cached it as successful**. `docker compose up -d` reported `chat Built`
and started a container that crashed at runtime (`ENOENT: .../client/dist/index.html`)
— a much worse place to discover a build failure than the build log. Fixed to `&&`
(see the edited-files table below). **If a docker build for this fork ever again
reports success suspiciously fast, suspect the cache before the code.**

**A new dependency can break the PWA build in a way no earlier commit could have.**
Adding `vega` + `vega-lite` + `vega-embed` for the chart patch pushed the `vendor`
bundle to 4.4 MB, over `vite-plugin-pwa`'s (already-raised, from Workbox's 2 MiB
default) 4 MB precache limit — the build failed at the FINAL step, minutes in,
with `Configure "workbox.maximumFileSizeToCacheInBytes"`. Raised to 6 MB
(`client/vite.config.ts`) with headroom for the next dependency. **Any future
patch that adds a real dependency should re-check this build step, not just its
own typecheck** — a large enough addition anywhere in the app can trip a limit
that has nothing to do with the code that added it.

**The PWA manifest is a branding surface `Wordmark.tsx` cannot reach.** The
install-prompt name, home-screen label, and splash-screen background come from
`vite-plugin-pwa`'s `manifest` config in `client/vite.config.ts` — a build-time
generated file, not the static `logo.svg`/`favicon.svg` patch #2 already fixed.
It still said `name: 'LibreChat'`, `theme_color: '#009688'` (teal) until this
patch. Fixed alongside the size-limit fix above, since both are in the same
config block. **Not yet fixed**: `icon-192x192.png` and `maskable-icon.png`
referenced by this manifest are still upstream's generic icons, not rasterized
from our mark — lower priority than the text identity, since a wrong icon reads
as "unbranded", not as "wrong brand", but worth closing out alongside a real
maskable-icon design pass (the safe-zone padding a maskable icon needs is a
genuine design task, not a quick rasterize).

---

## One runtime lesson, found by actually opening the app in a browser

The four lessons above were all caught by running `docker compose build`. This
one needed more: the build succeeded, the container ran, and the grid artifact
still rendered wrong — because the four lessons above only prove the app
*starts*, not that a specific message renders the way a user would see it.

**The connector's artifact markdown was wrong in TWO successive ways, and unit
tests stayed green through both**, because every test on the erpray-app side
only asserted the markdown *string* looked right — none of them opened a
browser. Version 1 was a bare ` ```html ` fence (no directive at all — renders
as a plain syntax-highlighted code block). Version 2 fixed that to a real
`:::artifact{...}` directive, but dropped the HTML in bare (no fence inside
it) — LibreChat's own `useArtifacts.ts` parser expects an inner fence, so this
STILL rendered as a raw code dump, not an opened Sandpack panel. The correct
form, confirmed by a live Playwright run whose screenshot showed the actual
Code/Preview split panel:

```
:::artifact{identifier="erpray-grid" type="text/html" title="Grid"}
```html
<html>...</html>
```
:::
```

This is entirely a connector-side fix (`packages/core/src/artifactDirective.ts`
in erpray-app) — nothing in this repo needed to change to consume it correctly,
since it's LibreChat's own existing parser doing the work. **Confirming it
required running the real thing**: a network request to
`*.sandpack-static-server.codesandbox.io` appeared for the first time only once
the inner fence was added, which is what proved Sandpack had actually been
invoked rather than just typechecked correctly.

**Same run also settled AGENT_BUILD_INSTRUCTIONS.md §5.3's flagged
sandbox-fetch question, definitively**: the Sandpack artifact panel is served
from that CodeSandbox-hosted origin, not same-origin with the app — so
`fetch()` from inside the artifact back to the connector fails with
`TypeError: Failed to fetch`, observed live. The grid's `sandboxFallback` catch
path exists for exactly this and is confirmed necessary, not defensive
over-engineering for a hypothetical. **Any write-from-artifact interaction
(grid cell edit → preview → confirm) must route through the chip/chat-command
fallback — the in-artifact fetch will never reach the connector in this
deployment shape.**

---

## New files (no upstream conflict risk)

| File | Purpose |
|---|---|
| `client/src/components/Messages/Content/VegaLiteChart.tsx` | Renders the connector's ` ```vega-lite ` fences via `vega-embed`. Copies the `Mermaid.tsx` *pattern* (dedicated component, hooked into the same `code` router) without its 850 lines of diagram-specific zoom/pan/dialog machinery — a chart the connector already sized doesn't need it. Debounces render attempts (250ms) because the connector streams markdown in ~40-char chunks and a partial JSON fence would otherwise flash an error before snapping to the finished chart — the same problem `Mermaid.tsx` solved with `useDebouncedMermaid`. |
| `client/src/erpray/Wordmark.tsx` | The ONE place the two-tone `ERP`+`ray` wordmark and the tagline render. BRAND_GUIDE.md §1.1's whole point is that a single flat-color "ERPray" is a brand bug — funnelling every render through one component is what stops a second, un-synced, flat-colored copy from quietly appearing somewhere. |
| `client/src/erpray/theme.css` | Ink & Ray color tokens (BRAND_GUIDE.md §2) + Geist font imports. Overrides `.dark`'s semantic CSS custom properties with literal hex values — see the file header for why the shared `--gray-*` ramp is deliberately left untouched (it's shared with light mode, which stays as upstream). |
| `client/public/assets/favicon.svg`, `favicon-{16,32}x{16,32}.png`, `apple-touch-icon-180x180.png` | The block+beam mark (BRAND_GUIDE.md §5), rasterized from the SVG source via `sharp` (dev-only, not shipped) so the PNGs are pixel-exact renders of the same geometry as `Wordmark.tsx`'s icon, not a hand-drawn approximation. |
| `client/src/erpray/FollowupChips.tsx` + `.spec.ts` | Parses the connector's trailing `**Next:** \`chip\` · \`chip\`` line out of the markdown and renders it as real, clickable pill buttons instead. `parseChips()` is a pure function, unit-tested against a STRING LITERALLY CAPTURED from running `toMarkdown(composeAnswer(...))` in erpray-app/packages/core (2026-07-15) — not a hand-guessed approximation of the format, which could have passed forever while the real integration silently broke. 7/7 green. Also: this one patch replaces all 11 of SyteRay's old per-message action buttons (AGENT_BUILD_INSTRUCTIONS.md §5.4) — those were only canned prompt triggers, which is exactly what this does, generically, driven by the connector's own answer contract. |
| `client/src/erpray/AboutErpray.tsx` | The in-app half of MIT compliance (AGENT_BUILD_INSTRUCTIONS.md §1.1) — the LICENSE file satisfies the legal letter, but a customer never opens it. Rendered in the General settings tab rather than a dedicated "About" tab, deliberately: a new tab needs a new `SettingsTabValues` enum member in the upstream `librechat-data-provider` package, a far larger patch than crediting LibreChat actually requires. |
| `client/public/assets/maskable-icon.svg`/`.png`, `icon-192x192.png` | The real maskable PWA icon (previously upstream's generic icon, tracked as a known gap). A maskable icon needs the mark inside the ~80%-diameter "safe zone" with a FULL-BLEED background — a plain export of `favicon.svg` at 512×512 would lose the beam's tips to a circular OS crop. New source SVG: Ink (`#06080F`) background edge to edge, the existing mark scaled to ~59% and centered. Rasterized via `sharp` (dev-only, installed with `--no-save`, not a persisted dependency), same as the favicon/apple-touch-icon assets. |
| `e2e/erpray/` (`stub-connector.mjs`, `artifacts.spec.ts`, `playwright.config.ts`, `README.md`) | The runtime lesson above (nested-fence artifact directive, sandbox blocking `fetch()`) was proven ONCE, by hand, in a Playwright session with no trace left afterward. Committed as a real regression suite: a stub connector standing in for erpray-app (no NetSuite/LLM credentials needed) plus 5 Playwright tests, run against the REAL built Docker image. First run caught two bugs in the stub/test itself, not the product — an overly broad assertion that flagged the artifact panel's own legitimate "Code" tab as a failure, and a missing `/embed/grid/:token` route in the stub — both fixed, then 5/5 green against the actual running stack. |

## Edited upstream files

| File | Change | Why |
|---|---|---|
| `client/src/components/Chat/Messages/Content/MarkdownComponents.tsx` | Added an `isVegaLite` branch to both `code` and `codeNoExecution`, identical in shape to the existing `isMermaid` branch. | This is the ONE place fenced code blocks are routed by language tag — adding a second routing mechanism elsewhere would be exactly the "N unsynchronised copies" bug class the connector's own code repeatedly warns against. |
| `client/src/components/Chat/Messages/Content/Markdown.tsx` | Runs `parseChips()` on the message content before feeding it to `ReactMarkdown`; renders `<FollowupChips>` after it. | The single point every non-user message's markdown flows through (`MessageContent.tsx` routes `!isCreatedByUser` here, `MarkdownLite` for the user's own messages — chips only ever appear in connector answers, so only this file needed the patch). |
| `client/package.json` | Added `vega`, `vega-lite`, `vega-embed` as direct dependencies, version-pinned; `@fontsource/geist-sans`, `@fontsource/geist-mono`. | See "The vega-embed version trap" below. Fontsource packages are self-hosted (SIL OFL-1.1), no CDN. |
| `client/src/main.jsx` | One import line: `./erpray/theme.css`, placed after `./style.css`. | The entire hook point for the color/font override — see `theme.css`'s own header for why it lives in a new file rather than editing `style.css` in place. |
| `client/index.html` | Title, meta description, favicon links, `theme-color`, and the pre-paint loading-screen background color/default. | These render BEFORE React mounts — a patch that only touched the React layer would leave a LibreChat-branded flash on every cold load. |
| `client/src/routes/Layouts/Startup.tsx`, `client/src/components/Agents/Marketplace.tsx` | `document.title` / page-title fallback strings, `'LibreChat'` → `'ERPray'`. | The only two places a hardcoded fallback name reaches the tab title once `startupConfig` has loaded. |
| `Dockerfile` | The frontend-build `RUN` step: `a; b; c` → `a && b && c`. | Not a branding change — a build-hygiene fix. See "build-time lessons" above: with `;`, a failed `npm run frontend` was silently cached as a successful layer. |
| `client/vite.config.ts` | `workbox.maximumFileSizeToCacheInBytes`: 4 MB → 6 MB. `manifest.name`/`short_name`/`theme_color`/`background_color`: `'LibreChat'`/teal → `'ERPray'`/Ink. | The vega dependency addition tripped the Workbox precache limit — a real build failure, not a style choice. The manifest fields are the PWA-install branding surface `Wordmark.tsx` cannot reach (it's build-time generated, not a static file). |
| `client/tailwind.config.cjs` | `colors.gray.{700,800,850,900}`: LibreChat's own hardcoded scale → Ink values (`#1D2842`/`#0C111E`/`#0A0E1A`/`#06080F`). | Found live, not by reading code: the body background was STILL the wrong near-black after `theme.css`'s CSS-custom-property overrides were confirmed working, because the visible container uses a literal Tailwind class (`dark:bg-gray-900`), which resolves through Tailwind's OWN color scale in this file — a second, completely separate color system from `theme.css`'s `--surface-*` custom properties. Verified with a real screenshot: `rgb(6, 8, 15)` = exactly `#06080F` only after this fix. |
| `client/src/components/Auth/AuthLayout.tsx` | Replaced the plain `<img src="assets/logo.svg">` login-page logo with `<Wordmark withMark /><Tagline />`. | The first screen every user ever sees. BRAND_GUIDE.md §1.1 rule 7 names exactly this kind of introductory placement as where tagline adjacency matters most. |
| `client/src/components/Nav/SettingsTabs/General/General.tsx` | One import, one `<AboutErpray />` render at the bottom. | The MIT-credit component's only hook point — see `AboutErpray.tsx` above for why General rather than a new tab. |
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

## The 5 role personas as real LibreChat Agents

`config/seed-role-agents.js` — run once after the first admin account exists
(`node config/seed-role-agents.js --owner=<admin-email>`), idempotent on
re-run. Ports the actual CONTENT of SyteRay's 5 role personas
(`openwebui/functions/syteray_role_agents.py` — Controller, Buyer, Planner,
DBA, Sales), re-grounded in ERPray's own NetSuite metric/action catalog
(Controller, Sales Ops, Purchasing, Warehouse, Collections), NOT the
mechanism — SyteRay's version was a whole separate Python routing layer
(an OpenWebUI "pipe") reimplementing something a native LibreChat Agent
already does. Every persona points at the SAME connector model
(`erpray-balanced`); the difference lives entirely in `instructions`.

**A real gap found only by actually clicking through it, not by reading the
schema**: `modelSpecs.enforce: true` (ERPray's own "one curated experience,
hide raw provider pickers" design) locks the picker to EXACTLY the static
`modelSpecs.list` in `librechat.yaml` — an Agent seeded into MongoDB with a
name and instructions is invisible to every user unless it ALSO has a
`modelSpecs` entry with `preset: {endpoint: 'agents', agent_id: '<id>'}`.
That entry needs a FIXED agent id to reference from static YAML, which is why
the seed script uses fixed ids (`agent_erpray_controller` etc.) instead of
LibreChat's normal random `nanoid()` — the two files must agree on the exact
same ids. `deploy/librechat.yaml` (erpray-app) has the 5 matching entries.

Also required, and easy to miss: `grantPermission` with `PrincipalType.PUBLIC`
(not just the owning admin) plus `addAgentIdsToProject` on LibreChat's GLOBAL
project — without both, the agent exists and even appears in the picker's
config but a second, unrelated user account cannot actually use it. Verified
live: registered a brand-new, unrelated user, confirmed all 5 personas (plus
ERPray and Deep Research) were visible and pickable, then asked "ERPray ·
Controller" a real question and confirmed it round-tripped to the connector
and rendered the full answer (chart, grid artifact, chips) — not just that
the picker rendered a name.

## The skill library as LibreChat Prompts

`config/seed-starter-prompts.js` — run once after the first admin account
exists (`node config/seed-starter-prompts.js --owner=<admin-email>`),
idempotent on re-run. SyteRay's "skill library"
(`packages/connector/src/chat/skillStore.ts`) was a generic, no-code,
user-built custom-agent mechanism (its own Postgres table: name + system
prompt + tool allow-list + example prompts) — there was never a fixed
catalog of skill CONTENT to port the way the 5 role personas had 5 concrete
personas; it was a MECHANISM, and LibreChat's native Prompts feature (saved,
shareable, `{{variable}}`-parameterized templates) already replaces that
mechanism directly. Reimplementing skillStore's table would be building a
second, worse copy of a feature LibreChat ships out of the box. Confirmed by
grep across SyteRay's own repo: no `DEFAULT_SKILLS`/`seedSkill`/hardcoded
example content exists anywhere, only the store implementation.

What DOES port is the underlying idea — reusable, parameterized business
"recipes" — as 6 starter Prompts grounded in ERPray's own domain: Customer
360 (`{{customer}}`), Weekly AR digest, Vendor risk check (`{{vendor}}`),
Late order chase list, Margin check (`{{period}}`), New customer follow-up
(`{{days}}`).

**Verified live, the same way as the role agents**: registered a brand-new,
completely unrelated user, and confirmed via the real
`GET /api/prompts/groups` endpoint (not just a direct DB read) that all 6
prompts are visible with their `{{variable}}` placeholders intact. Unlike
Agents, there is **no** `modelSpecs.enforce` gap here — Prompts are
fetched dynamically through the ACL-aware route
(`findAccessibleResources` + `findPubliclyAccessibleResources`), not gated
by a static YAML list, so `grantPermission(PUBLIC, PROMPTGROUP_VIEWER)` +
`addGroupIdsToProject` on the GLOBAL project was sufficient on its own —
confirmed by testing rather than assumed, since the Agents gap was exactly
this kind of thing that only showed up by actually exercising it.

(Minor, unrelated observation made while verifying: `GET /api/prompts/groups`
throws a 500 if called with neither `pageSize` nor `limit` in the query
string — `actualLimit` stays `undefined` and a later `.toString()` on it
throws. The real frontend always sends `pageSize`, so this never surfaces
in normal use; noting it here rather than "fixing" a code path we don't own
and haven't fully characterized.)

## Not yet done (see erpray-app/RESUME.md for the full remaining list)

- (nothing outstanding from the original skill-library/persona/Deep-Research list — see erpray-app/BLOCKERS.md for what's left overall)
