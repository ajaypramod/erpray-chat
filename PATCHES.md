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

## Edited upstream files

| File | Change | Why |
|---|---|---|
| `client/src/components/Chat/Messages/Content/MarkdownComponents.tsx` | Added an `isVegaLite` branch to both `code` and `codeNoExecution`, identical in shape to the existing `isMermaid` branch. | This is the ONE place fenced code blocks are routed by language tag — adding a second routing mechanism elsewhere would be exactly the "N unsynchronised copies" bug class the connector's own code repeatedly warns against. |
| `client/package.json` | Added `vega`, `vega-lite`, `vega-embed` as direct dependencies, version-pinned. | See "The vega-embed version trap" below — this is not a casual pin. |

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

- Branding (wordmark, ink/panel colors, ray gradient, Geist fonts)
- `FollowupChips.tsx`
- `librechat.yaml` wiring / titleModel guard
- Artifact-iframe sandbox-fetch verification
