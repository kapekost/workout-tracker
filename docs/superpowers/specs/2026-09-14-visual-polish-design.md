# Visual polish: icons, color/type/surface identity, and motion

**Date:** 2026-09-14
**Status:** Owner-approved via live brainstorming session (visual companion), 2026-09-14. Not yet split into ready children.
**Covers:** #164 (animation), #152 (icons/visual polish), #168 (color/theme identity).
**Decision record:** `docs/orchestration/DECISIONS.md`, 2026-09-14 "Visual-polish workstream: #164/#152/#168 bundle into one spec, full sweep".

---

## Problem

Three raw asks, all pointing at the same underlying complaint — the app looks generic/AI-default
rather than considered:

- **#164:** modals and screen transitions snap with no motion.
- **#152:** icon choices are ad hoc emoji, sometimes semantically wrong (Lower B's day emoji is
  🔥, which reads as unrelated to leg day — the owner's own example).
- **#168:** the color theme (dark background, mint-green `#6ee7b7` accent) reads as generic —
  itself a very common default palette for AI-generated dark-mode apps, which is exactly what's
  being flagged.

All three were raised within a week of each other, each already named the possibility of a
combined pass in its own "needs triage" section, and the owner confirmed live (this session) they
should land as one coordinated spec rather than three independent PRs.

## Scope

**In:**
- A full token swap of `frontend/src/lib/theme.js` / `index.css`'s color custom properties to a
  new palette ("Mono + Volt" below).
- A heading-weight/tracking refinement using the existing self-hosted Inter/JetBrains Mono
  pairing — **no new font**.
- A vendored icon set (Heroicons-outline-style, sourced as raw SVGs, no npm dependency) replacing
  every emoji/ad hoc icon used as UI chrome across the app.
- Four custom workout-day icons (replacing 💪 🦵 🏋️ 🔥), drawn in the same stroke style as the
  vendored set.
- A motion system: bottom-sheet slide+fade for the app's one real modal (`ExerciseCuesModal`), and
  a crossfade for screen-to-screen route transitions.
- Respecting the existing `prefers-reduced-motion` media query in `index.css` for all new motion.

**Out:**
- Any new component library, CSS framework, animation library, or design-system layer (standing
  "efficient, not overengineered" constraint, `DECISIONS.md` 2026-09-06).
- Restructuring `.card` padding variants, the eyebrow-label/toast/pill hand-rolled component
  duplication, or any of the other follow-ons named out-of-scope in
  `2026-08-23-design-tokens-design.md` — this spec recolors and re-icons the existing structure,
  it doesn't refactor it.
- A UI/UX-expert review of the *rendered* result — that's the standing gate at execution time
  (`DECISIONS.md` 2026-09-06), not something this spec substitutes for.
- Slide push/pop route transitions (direction-tracked navigation) — considered and explicitly
  rejected in favor of crossfade, see Motion section.

---

## 1. Color / type / surface identity (#168)

### Palette: "Mono + Volt"

True neutral grayscale surfaces (no blue or warm tint, unlike the current `#0a0a12`/`#111120`),
one saturated lime accent used sparingly — for CTAs, active/selected states, and highlights only,
never as a general "brand wash." This was chosen over two other candidates presented live (a warm
orange-red "Ember" direction, and a violet-blue "Indigo Pulse" direction) specifically for reading
least like a default AI-generated palette.

`frontend/src/lib/theme.js` `colors` token swap (Tier 1, `index.css` `:root` mirrors each 1:1 per
the existing convention documented at the top of `theme.js`):

| Token | Current | New | Notes |
|---|---|---|---|
| `bg` | `#0a0a12` | `#0d0d0d` | True neutral, no blue tint |
| `card` | `#111120` | `#1a1a1a` | True neutral |
| `border` | `#1e1e32` | `#2a2a2a` | True neutral |
| `mint` (primary accent) | `#6ee7b7` | `#d4ff3f` | Renamed `accent` — see note below |
| `amber` | `#fbbf24` | *(removed, call sites remapped)* | See the `success`/no-color remap below the table |
| `muted` | `#9ca3af` | `#999999` | |
| `muted2` | `#7c8593` | *(recompute)* | Must re-run the WCAG contrast check `theme.test.js` already does — new `bg`/`card` are darker, so the existing `#7c8593` value may no longer clear 4.5:1. Recompute against the *new* `bg`/`card`, don't carry the old value forward unchecked. |
| `text` | `#fff` | `#fff` | Unchanged |
| `danger` | `#ef4444` | `#ef4444` | Unchanged — stays visually distinct from the accent, not derived from it |
| `dangerBg` | `#2a1a1a` | `#2a1a1a` | Unchanged |
| `textSecondary` | `#e2e8f0` | `#e5e5e5` | Neutral to match new surfaces |
| `surface1` | `#14142a` | `#1f1f1f` | Neutral |
| `divider` | `#1e1e32` | `#2a2a2a` | Same as new `border` |
| `mintWash` → `accentWash` | `rgba(110,231,183,0.14)` | `rgba(212,255,63,0.14)` | Same alpha, new accent |

**Rename `colors.mint` → `colors.accent` and `colors.mintWash` → `colors.accentWash`** across every
call site (the executor's job is a rename + recolor, not introducing a parallel token) — grepping
`theme.js`/`index.css`'s current usage count is the acceptance check that nothing was missed.

**A success/PB-specific green stays**, separate from the accent — the current `mint` value's other
job (marking PBs, positive deltas) doesn't disappear, it just stops being the same token as the
primary accent. Add a small dedicated `colors.success` (`#4ade80`, confirmed live against the
"Indigo Pulse" mockup) for exactly those call sites, so the lime accent isn't overloaded with two
different meanings (CTA vs. "you got stronger").

**`amber`'s removal needs an explicit landing spot for its 7 real call sites** — found during
execution prep, not caught by the earlier self-review. `colors.amber` isn't purely decorative
today; it's semantically split two ways:
- **Achievement/confirmation (5 sites) → `colors.success`:** `.toast`'s default background
  (`index.css`), `History.jsx`'s "best set" highlight, `Workout.jsx`'s "🎉 New PR" line,
  `Progress.jsx`'s Personal Record stat, `PersonalBests.jsx`'s weight display. All five are
  celebrating a result, the same job `success` already exists for — no new token needed, just
  route them there instead of inventing a second green.
- **Neutral attention, not achievement (2 sites) → no color, use weight/emphasis instead:**
  `TimerBar.jsx`'s "paused" state and `VersionBadge.jsx`'s stale-version warning aren't
  celebrating anything, and forcing them onto `success` would misuse it. Mono+Volt's one-accent
  philosophy means these don't get a third semantic color — use `colors.text` (full white) with
  bold weight to stand out instead, the same way the rest of the neutral-grayscale surfaces signal
  emphasis without adding hue.

### Type

No new font. Keep the existing self-hosted Inter (body/UI) + JetBrains Mono (numbers) pairing —
zero new asset weight, no change to the offline-PWA font precache. Refine heading treatment only:
heavier weight (`type.weight.bold` already exists at 700 — use it more consistently on titles that
currently use `semibold`) and tighter letter-spacing (`-0.01em`) on page/card titles specifically,
not body text. This is a values-only change inside the existing `type` token object in `theme.js`,
no new keys needed beyond a `letterSpacing.tight: '-0.01em'` addition.

### Surface treatment

Flat, single-border cards — matches the existing `.card` class shape (`background` + `1px solid
border` + `border-radius: 16px`) exactly, just recolored per the table above. No new
shadow/gradient/depth system. This was a deliberate choice against a "fuller" elevated-surface
option, kept simple per the standing efficiency constraint.

---

## 2. Icon system (#152)

### Sourcing

- **Vendored chrome icons**: Heroicons-outline style (thin `1.2px` stroke, sharp/square corners —
  chosen live over a Lucide-rounded and a Phosphor-bold alternative for being the closest visual
  match to the new neutral-grayscale surfaces). Source the actual Heroicons MIT-licensed outline
  SVGs (https://github.com/tailwindlabs/heroicons, `optimized/24/outline`) for the specific glyphs
  needed — copy only those files into `frontend/src/icons/`, no npm package, no build-time icon
  font. Each icon is a small standalone `.jsx` wrapper (`<IconName />`) or a raw inline `<svg>`,
  matching whichever pattern reads more naturally against the existing all-inline-style component
  convention — the plan should pick one and use it for every icon, not mix approaches.
- **Custom day icons**: two base shapes (upper-body, lower-body) in the same stroke weight/style as
  the vendored set, each with an A/B variant distinguished by a small filled-vs-outlined accent
  dot rather than four unrelated pictograms. This directly replaces the current
  `workoutPlan.js` `emoji` field's four values (`💪 upper_a`, `🦵 lower_a`, `🏋️ upper_b`, `🔥
  lower_b`) and fixes the flagged mismatch (fire for leg day) as a side effect of the sweep, not as
  a special case.

### Inventory (full sweep — every site found, grouped by kind)

| Category | Sites (file:line, current glyph) |
|---|---|
| Workout-day identity | `data/workoutPlan.js:7,92,164,249` (💪🦵🏋️🔥) — consumed by `Home.jsx`, `History.jsx`, `Workout.jsx`, `MuscleGroupPicker.jsx` via `plan.emoji`/`next.emoji`/`bestDay.emoji` |
| Navigation chrome | `components/NavBar.jsx:8` (☰), `components/TopBar.jsx:63,87` (🏋 app mark, 👤 profile) |
| Status/feedback | `components/ResumeBanner.jsx:41,43` (✓/✗), `pages/PersonalBests.jsx:113`, `pages/History.jsx:148`, `pages/Workout.jsx:58,466,513` (✓ checkmarks) |
| Achievement/celebration | `pages/Workout.jsx:268,280` (🎉), `pages/Workout.jsx:322,448`, `pages/Progress.jsx:63,81`, `pages/History.jsx:57` (🏆 trophy/PB marker) |
| Misc functional | `components/TimerBar.jsx:49` (🔆 wake-lock), `components/VersionBadge.jsx:91` (⚠ warning), `pages/Workout.jsx:538,547` (📋/📝 notes) |
| Generic buttons | 5 `btn-icon` sites already use bare text glyphs (`×` for close, etc.) — these become real icon components too, not left as the one exception |

This table is the acceptance list for "full sweep" — the plan should check every row off, and a
grep for emoji ranges (as used to build this table) is the mechanical way to confirm nothing was
missed, the same way the color-token rename above is checked by grepping for the old token name.

---

## 3. Motion system (#164)

### Modals — bottom sheet, the app's one real modal shape

`ExerciseCuesModal` is currently the app's only real modal (`role="dialog"`, fixed overlay) — it
already opens as a bottom sheet with no animation today. It gets bottom-sheet slide-up + fade,
`~250ms`, `cubic-bezier(.32,.72,0,1)` — an easing curve chosen live for feeling like a native sheet
dismissal, not a linear/ease-default slide.

**A centered fade+scale pattern was considered for confirm/destructive actions and explicitly
dropped** — corrected during spec self-review after building a live demo that assumed a
"Delete this session?" modal which doesn't exist. Destructive actions (`History.jsx`,
`PersonalBests.jsx`, `Workout.jsx`'s `SetRow`) all use an established tap-again-to-confirm button
pattern instead — a deliberate existing choice (see the comment at `Workout.jsx`'s `SetRow`,
"reuses the tap-again-to-confirm pattern... rather than inventing a second pattern for the same
idea"). Retrofitting a modal onto that would be a real interaction-pattern change, not a
recolor/re-animate of existing structure, and is explicitly out of scope here (see Scope > Out).
If a second real modal is ever added later, the centered fade+scale pattern above is the
recommended default for it — but nothing in this workstream introduces one.

### Screen-to-screen transitions

Crossfade, `~200ms`, standard `ease`, on route changes. Chosen live over a slide push/pop
(iOS-style) alternative — slide requires tracking navigation direction (forward vs. back) to
animate the correct way, which is real additional implementation surface for marginal feel benefit
in a small app with a shallow, mostly-flat route tree (`App.jsx`'s `AppRoutes`). Implementation
approach is an open call for the plan to make: either the browser's native View Transitions API
(`document.startViewTransition`, no library, but check current browser support against this app's
actual deployed-to devices) or a manual CSS-transition wrapper keyed on `location.pathname` (more
control, more code). Whichever is picked, it must not require a new dependency.

### Accessibility

All new transitions/animations get added to the existing `@media (prefers-reduced-motion: reduce)`
block in `index.css` (currently disables `.timer-bar.flash`, `.toast`, `.skeleton`, and the
recovery-ring transition) — same block, not a parallel one.

### Verification (applies to all three Issues, not just motion)

This spec sets direction; it does not substitute for the standing execution-time UI gate
(`DECISIONS.md` 2026-09-06, refined 2026-09-14). Whichever Issue(s) this becomes, before merge:

1. **Render it and look at it in an actual browser** — deploy or run the app, open the real
   pages/screens, take screenshots (and for motion specifically, a recording — a static screenshot
   can't show a transition). Reading the diff is not looking at it.
2. **Get a UI-expert review and a UX-expert review — two separate passes**, both against those
   screenshots/recordings, not the JSX: the UI pass judges visual design (hierarchy, spacing,
   color/icon consistency, alignment, typography); the UX pass judges usability (affordance, flow,
   copy clarity, accessibility, one-handed phone use). They can disagree with each other — that's
   the point of keeping them separate.

Given this workstream touches nearly every screen in the app, budget real time for this — it is
not a formality on top of code review, it is where the actual defects have historically been found
(`DECISIONS.md` 2026-09-06's three shipped-and-invisible-in-code-review examples).

---

## Sequencing

`#168`'s token swap should land first (or in the same PR as `#152`'s icon-color dependencies,
since icons render at the new accent color) — `#164`'s motion work should build against the new
surfaces, not the current mint theme, to avoid animating a look that's about to be replaced.
Recommended order: **#168 → #152 → #164**, though a single combined PR is also acceptable given
how small each individual token/icon change is in isolation; the plan should decide based on how
large the resulting diff actually is once scoped.

## Effort

Each of the three Issues stays independently sized once split (`effort:S`–`M` each is the
expectation — a token rename, an icon inventory swap, and a motion-token application are each
mechanical once this spec's decisions are made) — none should need further splitting into
sub-Issues. If any one balloons past `effort:M` once a plan is written against it, that's a signal
the plan scoped it wrong, not that this spec under-scoped it.
