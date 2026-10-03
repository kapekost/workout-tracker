# Progress / Personal Bests visual redesign + nav icon fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Origin:** Direct owner dispatch (not a queued Issue), 2026-09-27, immediately after PR #217
(mobile icon audit) deployed to production: *"Still seems the icons are small we should review
with ui ux expert and redesign the screen with the records and progress."*

**Root-cause investigation done before this plan** (real production at `8f293b7` confirmed live,
no caching issue; local instance built from a clean `origin/main` checkout at the same commit;
real screenshots at desktop ~1148px and the narrowest achievable window in this environment,
~500px — Chrome enforces a window-width floor here, true 375–390px wasn't reachable but ~500px
still exposes the same defects at both sizes):

- PR #217's fix was real and correct as far as it went: it restored the **literal pixel height**
  of 3 PNG-backed icons (`IconArrowTrendingUp`/progress.png, `IconClipboardList`/history.png,
  `IconDayUpper`/upperbody.png) that were being shorted by `object-fit: contain` letterboxing.
  Verified live: no clipping/letterboxing remains at either viewport width.
- **But the owner's complaint survives it, and is visually real** — confirmed independently by
  the controller's own zoomed screenshots and by two separate fresh-subagent reviews (UI-expert,
  UX-expert, both `sonnet`, both reviewing the same 9 real screenshots blind to each other's
  output). Every finding below was then checked against actual source, not taken on the
  reviewers' word (PLAYBOOK step 5's standing requirement — this project has direct history of
  confident-sounding review findings that were wrong).
- **Real root cause (verified against source):** `IconArrowTrendingUp` and `IconClipboardList`
  (the Progress/History bottom-nav tabs) are `<img>`-wrapped PNG rasters
  (`frontend/src/assets/icons/progress.png` 164×114, `history.png` 164×106) sourced from an
  AI image-generation pass (#213, 2026-09-27 morning) chosen specifically because a same-color
  opacity accent is structurally invisible in a single-`currentColor` SVG. They sit in the same
  22px-tall nav-bar row as `IconHome`, a flat two-path SVG (`fill`+`opacity=".28"` duotone) that
  fills its box edge-to-edge. The PNGs have real internal padding baked into the raster (confirmed
  by viewing the source images directly — the drawn glyph occupies roughly 65–75% of the canvas,
  not edge-to-edge), gradient/drop-shadow "sticker" shading, and — confirmed in
  `IconArrowTrendingUp.jsx`/`IconClipboardList.jsx` — accept a `color` prop that is destructured
  and **never applied to anything** (`NavBar.jsx` passes `color={isActive ? colors.accent :
  colors.muted}` and it's silently dropped; only `opacity` — 1 active / 0.5 inactive — actually
  changes anything). So even in the active state, these two icons never bold up or recolor to the
  accent the way `IconHome` does; they just get less dim. Equal box height was never going to fix
  a different rendering technique, different color language, and a component contract that drops
  half its own props.
- **A second, independently real, already-shipped-and-verified precedent exists for the fix:**
  `#209` (same day, this session) already hand-authored 3 brand-new icons
  (`IconPlay`/`IconPause`/`IconRefresh`) directly as flat SVGs in this exact house style — no
  external AI image tool, no new asset pipeline — and an independent code review hand-verified
  the path geometry. This plan repeats that same, already-proven approach for the 2 nav icons,
  rather than re-opening the abandoned `#210`/`#212`/`#213` AI-image saga.
- **Second, independently verified defect (both reviewers flagged it, from different angles;
  confirmed in `NavBar.jsx` + `App.jsx`):** the bottom nav's active-tab detection
  (`tabs.find(t => pathname.startsWith(t.path) && t.path !== '/')?.path ?? '/'`) has no entry for
  `/personal-bests` (a real, separate route in `App.jsx`, reachable only from Progress's "PBs"
  button — grepped, confirmed no other entry point exists anywhere in the app). Landing there
  falls through to the `?? '/'` default and lights up **Home**, while the in-page "← Progress"
  breadcrumb two rows above correctly says where you actually are. Two pieces of the same screen's
  own chrome disagree about "you are here."
- **Third, verified-against-source finding:** `StatPair.jsx` (the shared stat component) hardcodes
  `fontSize: '1.5rem'` with no override — so Progress's "Personal Record" (the page's actual
  purpose) and "Sessions" (a secondary count) render at byte-identical type scale, distinguished
  only by color and a 14px trophy glyph. The chart card beneath is visually larger/denser than the
  stat card that's supposed to be the page's focal point.
- **Fourth, verified-against-source finding:** `Progress.jsx` computes `pr` as a bare
  `Math.max(...)` — there is no delta/trend computation anywhere in the file, despite `data`
  (the full session history for the selected exercise) already being loaded client-side. A user
  has to eyeball the 6-point line chart to answer "am I improving," which the PR number itself
  doesn't answer.
- **Fifth, verified-against-source finding:** `PersonalBests.jsx`'s entries render through the
  same flat `.card` + bold-name + colored-mono-value + gray-metadata row shape used everywhere
  else non-record data appears in this app (e.g. Home's exercise list, same shape, blue instead of
  green). Nothing marks a PB as an achievement beyond text color.

## Explicitly out of scope (per owner's "the screen with the records and progress" + the
"efficient, not overengineered" constraint — do not expand into this)

- `IconDayUpper`/`IconDayLower` (History/Home day badges), `IconClock`, `IconBarbell`,
  `IconClipboardDocumentList` — same PNG-sticker mechanism, same visual-weight issue in principle,
  but they render on Home/History/Workout/TimerBar, not the two named screens, and PR #217's own
  precedent was "scope to only what's confirmed broken at its own real call site." Leaving a
  `STATE.md` Needs-owner note for a possible follow-up Issue, not fixing here.
- The Personal Bests delete-confirm's silent 3-second timeout (UX review finding, real, but a
  pre-existing pattern this project already UI/UX-reviewed once before — see `HISTORY.md`
  2026-09-27's #152 entry — and unrelated to icon sizing or hierarchy). Not touched.
- Adding a 4th bottom-nav tab for Personal Bests, or any new nav structure. The active-tab fix
  above (treating `/personal-bests` as "Progress is current") solves the wayfinding break without
  adding surface area.
- Any component library, CSS-in-JS framework, or new design-system abstraction. Every change below
  reuses `frontend/src/lib/theme.js` tokens and existing shared components (`StatPair`, `Eyebrow`,
  `Chip`, `.card`) as-is or with a small additive prop.

**Tech Stack:** React 19, vitest + `@testing-library/react` (existing convention), no new
dependency.

## Decisions this plan makes

1. **Both new icons are hand-authored flat SVGs**, matching the established `{size, color,
   ...props}` contract (`IconHome`/`IconTrophy`/`IconBolt` pattern: `fill={color}` silhouette +
   a second `opacity=".2"–".3"` path for a duotone accent) rather than a stroke-based contract —
   fill-based reads bolder at 22px, matching `IconHome`, and both glyphs (chart bars, clipboard)
   are naturally solid shapes, not line-art. Exact paths given in Task 1.
2. **`NavBar.jsx` drops the special-case `opacity` prop for these two tabs** now that both are
   real SVGs using `color` for active/inactive state exactly like `IconHome` already does — one
   consistent recolor mechanism across all 3 tabs instead of two different ones. `IconDayUpper`/
   `IconDayLower`/etc. (out of scope, still PNG) keep their own `opacity` contract unchanged;
   this only touches the two `NavBar.jsx` call sites.
3. **Active-tab fix is a one-line addition to the existing `tabs.find` predicate**, not a rewrite:
   treat `/personal-bests` as matching the `/progress` tab, since it's the only route that leads
   there and is conceptually its sub-page. No new state, no new prop.
4. **`StatPair` gets one new optional prop, `valueSize`**, defaulting to today's `'1.5rem'` (so
   every existing call site is byte-identical unless it opts in) — Progress's PR stat is the only
   call site that passes `type.size.display` (`'2rem'`, already an existing token, no new value).
5. **Trend delta is computed client-side from data already loaded** (`data[0]` vs the last entry,
   both already in `Progress.jsx`'s own `data` state) — no new API call, no backend change.
   Rendered as a small `Eyebrow`-styled line using the *new* `IconArrowTrendingUp` (recolored
   `colors.success` when the delta is positive, `colors.muted` at zero/negative — this app never
   logs a lighter PR so "negative" in practice only means "no second session yet," already guarded
   by the existing `data.length < 2` branch).
6. **Personal Bests rows get a small `IconTrophy` (already exists, SVG, no new asset) prefixing
   each entry's weight×reps line** — the cheapest possible "this is a record" signal reusing an
   icon the page already imports for its own back-button-adjacent "PBs" pill, no new component.

---

## Task 1: Redraw the 2 nav icons as SVG + fix NavBar active-tab + recolor mechanism

**Files:**
- Modify: `frontend/src/icons/IconArrowTrendingUp.jsx` (PNG `<img>` → SVG)
- Modify: `frontend/src/icons/IconClipboardList.jsx` (PNG `<img>` → SVG)
- Modify: `frontend/src/components/NavBar.jsx` (drop `opacity` prop on these 2 tabs; fix
  active-tab predicate for `/personal-bests`)
- Modify: `frontend/src/icons/icons.test.jsx` (move these 2 out of the "PNG-backed icons"
  describe block into the plain SVG assertions — they no longer render an `<img>`)
- Create: `frontend/src/components/NavBar.test.jsx` (no existing test file for this component)

**Interfaces:** unchanged public contract for both icons (`{size, color, ...props}` — same as
every other SVG icon in the set; `opacity`/`style` props some call sites may still pass land
harmlessly in `...props` on the root `<svg>`, same as any other icon).

- [ ] **Step 1: Write the failing tests**

  `icons.test.jsx` — remove `IconArrowTrendingUp`/`IconClipboardList` from the "PNG-backed icons"
  describe block's own dedicated assertions (they were never in the generic SVG block to begin
  with — add them there instead, e.g. to the existing "spreads extra props" / "currentColor" /
  "custom size" tests' parametrization, following the exact pattern already used for `IconHome`).

  `NavBar.test.jsx` (new):
  ```jsx
  import { render, screen } from '@testing-library/react'
  import { MemoryRouter } from 'react-router-dom'
  import NavBar from './NavBar'

  function renderAt(path) {
    return render(
      <MemoryRouter initialEntries={[path]}>
        <NavBar />
      </MemoryRouter>
    )
  }

  describe('NavBar', () => {
    it('highlights Progress, not Home, on /progress', () => {
      renderAt('/progress')
      expect(screen.getByText('Progress').closest('button')).toHaveStyle({ color: expect.any(String) })
      // assert via the tab's own active color token rather than a raw hex if theme import is available
    })
    it('highlights Progress (not Home) on /personal-bests, since that route only exists as a sub-page of Progress', () => {
      renderAt('/personal-bests')
      // the Progress label should render in colors.accent, Home's in colors.muted — assert by
      // comparing the two tabs' computed label color rather than a hardcoded hex
    })
    it('highlights Home on /', () => {
      renderAt('/')
    })
  })
  ```
  (The exact assertion style should match how this repo's other tests read inline-style color —
  check an existing component test, e.g. `Chip`'s or `TopBar.test.jsx`'s, for the established
  pattern before inventing a new one; don't hardcode a hex value if the codebase already has a
  convention for asserting against the `colors` import directly.)

  Run both — confirm they fail (old NavBar still lights up Home for `/personal-bests`; old icons
  still render `<img>` not `<svg>`).

- [ ] **Step 2: `IconArrowTrendingUp.jsx`**
  ```jsx
  export default function IconArrowTrendingUp({ size = 20, color = 'currentColor', ...props }) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
        <path d="M3.5 17 9 11.3l3.6 3 7.4-8.3" strokeWidth="4.2" />
        <path d="M3.5 17 9 11.3l3.6 3 7.4-8.3" strokeWidth="1.5" opacity=".35" />
        <path d="M14.5 5.3h5.5v5.5" strokeWidth="2.6" />
      </svg>
    )
  }
  ```
  A bold rising zigzag line (same double-stroke duotone technique as the existing `IconCheck`)
  ending in an open-corner arrowhead. Delete `frontend/src/assets/icons/progress.png` once
  nothing imports it (grep first — confirm no other call site).

- [ ] **Step 3: `IconClipboardList.jsx`**
  ```jsx
  export default function IconClipboardList({ size = 20, color = 'currentColor', ...props }) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true" {...props}>
        <path d="M6 4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5Z" />
        <path d="M9 2.2h6a1 1 0 0 1 1 1V5H8V3.2a1 1 0 0 1 1-1Z" opacity=".55" />
        <rect x="8" y="9" width="8" height="1.8" rx=".9" opacity=".3" />
        <rect x="8" y="13" width="8" height="1.8" rx=".9" opacity=".3" />
        <rect x="8" y="17" width="5.5" height="1.8" rx=".9" opacity=".3" />
      </svg>
    )
  }
  ```
  A flat clipboard silhouette (body + clip) with 3 reduced-opacity list-line rects — fills its box
  edge-to-edge like `IconHome`, unlike the old raster. Delete
  `frontend/src/assets/icons/history.png` once nothing else imports it (grep first).

- [ ] **Step 4: `NavBar.jsx`**
  - Drop the `opacity={isActive ? 1 : 0.5}` prop from the `<tab.Icon .../>` call — all 3 tabs now
    use `color={isActive ? colors.accent : colors.muted}` alone, matching `IconHome`'s existing
    mechanism.
  - Fix the active-tab predicate:
    ```jsx
    const active = pathname === '/' ? '/'
      : pathname.startsWith('/personal-bests') ? '/progress'
      : tabs.find(t => pathname.startsWith(t.path) && t.path !== '/')?.path ?? '/'
    ```
  - Update the inline comment above the icon color/opacity line — it currently explains the
    opacity-dims-PNG rationale, which no longer applies to these 2 tabs.

- [ ] **Step 5: Verify**
  - `npm test` — all pass, including the new/updated ones.
  - `npm run build` — clean.
  - Render live (backend+frontend dev servers, seeded profile): nav bar at both a desktop and the
    narrowest reachable window width — Progress/History icons now read bold/flat/edge-to-edge like
    Home, recolor fully on tap (not just dim), and Personal Bests correctly keeps Progress lit.
  - Grep confirms `progress.png`/`history.png` have no remaining importers before deleting them.

---

## Task 2: Progress page — emphasize the Personal Record stat, add a trend delta

**Files:**
- Modify: `frontend/src/components/StatPair.jsx` (additive `valueSize` prop)
- Modify: `frontend/src/pages/Progress.jsx` (PR stat uses the larger size; compute + render delta)
- Modify: `frontend/src/pages/Progress.test.jsx`

**Interfaces:** `StatPair({ label, value, valueColor, valueSize, align })` — `valueSize` optional,
defaults to today's `'1.5rem'` so every other call site (just the Sessions stat, same component)
is unchanged.

- [ ] **Step 1: Write the failing tests** (`Progress.test.jsx`)
  - Personal Record value renders at the larger size (assert the rendered `<p>`'s
    `style.fontSize` equals `type.size.display`, not `'1.5rem'`) while the Sessions stat next to
    it keeps the old size.
  - A trend delta renders once 2+ sessions are loaded (e.g. `data[0].weight = 60`, latest
    `= 70` → renders `+10 kg` or equivalent, using whatever sign/unit convention keeps the string
    simple — a raw signed number and unit, no new formatting library).
  - No delta renders when `data.length < 2` (already-guarded branch — confirm it doesn't throw).

- [ ] **Step 2: `StatPair.jsx`** — add `valueSize = '1.5rem'` param, use it in place of the
  hardcoded literal in the `<p>` style.

- [ ] **Step 3: `Progress.jsx`**
  - Pass `valueSize={type.size.display}` on the Personal Record `StatPair` only.
  - Compute `delta = data.length >= 2 ? data[data.length - 1].weight - data[0].weight : null`
    inside the existing render (no new `useEffect`/state — derived from `data`, which is already
    state).
  - Render the delta near the PR stat (inside the same card, below or beside the `StatPair`) using
    `Eyebrow` (or a plain styled `<p>`, matching whichever the rest of the card does) with the new
    `IconArrowTrendingUp` at a small size, colored `colors.success` when `delta > 0`, `colors.muted`
    otherwise, text like `+{delta} kg since {first session's date}` — reuse `type`/`colors`/`space`
    tokens only, no new hardcoded value.

- [ ] **Step 4: Verify** — `npm test`, `npm run build`, live render: PR stat visibly outranks
  Sessions now; delta line reads clearly next to it; the 1-session "log at least 2 sessions" empty
  branch still renders correctly with no delta/crash.

---

## Task 3: Personal Bests — trophy-mark each record row

**Files:**
- Modify: `frontend/src/pages/PersonalBests.jsx`
- Modify: `frontend/src/pages/PersonalBests.test.jsx`

**Interfaces:** none new — `IconTrophy` is already imported on this page (used in the back button
is `IconArrowLeft`; `IconTrophy` is *not* currently imported here — check `Progress.jsx`'s import
for the exact name — add the import).

- [ ] **Step 1: Write the failing test** — each rendered PB row includes a trophy icon (query by
  the icon's `aria-hidden` svg alongside the existing weight×reps text, or add a stable
  `data-testid` if the existing tests already rely on one for this row shape — check
  `PersonalBests.test.jsx`'s existing selectors first and match the convention rather than
  introducing a new query style).

- [ ] **Step 2: `PersonalBests.jsx`** — add `<IconTrophy size={14} color={colors.success} />`
  immediately before each row's `{r.weight_kg}kg × {r.reps}` span (small gap, matching the
  existing flex-row spacing already used elsewhere on this page, e.g. the "PBs"/"+ ADD" icon+text
  pattern already on this same file).

- [ ] **Step 3: Verify** — `npm test`, `npm run build`, live render at both viewport widths: each
  record row now reads as a small achievement, not a bare data row; no layout shift/wrap at the
  narrow width (check the longest existing row, e.g. "90kg × 5 · 2023 · Before injury layoff",
  still fits without wrapping awkwardly).

---

## Final verification (whole branch, before PR)

- [ ] Full `npm test` (frontend) + `pytest` (backend, unaffected but run anyway per repo
  convention) — all green, note counts.
- [ ] `npm run build` clean.
- [ ] Live render, both a desktop width and the narrowest window this environment can reach:
  screenshot nav bar, Progress, Personal Bests — compare directly against the "before" screenshots
  this investigation captured.
- [ ] Confirm `progress.png`/`history.png` deleted and nothing references them (grep).
- [ ] Independent code review (`sonnet`) — hand-verify the 2 new SVG paths render as intended
  (this project's own precedent from #209: solve/trace the path geometry directly, don't just
  trust that it "looks plausible").
- [ ] UI-expert + UX-expert re-review against **new** screenshots of the shipped state (not the
  same screenshots used to diagnose the problem) — PLAYBOOK's standing requirement to re-verify
  the *result*, not just the diagnosis.
