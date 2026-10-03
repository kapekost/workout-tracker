# Plan: design review findings — tracker and execution order

Date: 2026-10-03
Origin: two read-only specialist reviews dispatched in an opencode session on
`claude/import-auth-hardening` (UI/design-systems pass, UX/core-workflow pass). Neither wrote code.
Status: **Waves 0 and most of Wave 1 implemented** (see "What has shipped" below). Still open:
Wave 1.2's idempotency key, Wave 1.4, Wave 2, Wave 3, Wave 4, and the browser check that every
UI change in this repo is required to have — which could not be run where this work was written.

Spec: none. This is not an Issue's plan — it is the queue the two reviews produced, ordered so the
cheap high-confidence work lands first and the judgement calls go to the owner last.

Reference shape: `docs/superpowers/plans/2026-09-05-accounts-auth-core.md`. Mockup for the Wave 1
options: `.superpowers/brainstorm/review-2026-10-03/design-review-options.html` (gitignored).

## Read this first — three constraints that shape everything below

1. **#229 is unimplemented, not unimproved.** Spec
   (`2026-09-28-icon-design-system-design.md`) and plan (`2026-10-01-icon-design-system-229.md`) are
   merged but zero of it shipped: `theme.js` has no `icon` scale, no `colors.accentDeep`, no
   `colors.muted3`, no `tint()`; `DayIcon.jsx:11-13` still renders the accent dot the plan removes.
   **Any finding about icons, icon sizes or the timer-bar relayout is already-decided work, not a
   defect.** Do not file it twice.
2. **Two findings from the 2026-10-02 review are false against current code.** "Zero
   `focus-visible` styling" is wrong (`index.css:103-105`, app-wide ring, 16.8:1 on bg). The
   nav/timer safe-area "double-count" is a 1px gap and correct. Recorded here so the next session
   does not spend a tick re-deriving them.
3. **Both reviews are source-and-arithmetic only.** No browser, no build, no screenshots, no device.
   Each review listed its own "could not verify" items; those are reproduced in Wave 4 rather than
   silently dropped. Anything visual needs a look in a browser before it is called fixed — the repo
   already made "UI changes need a browser check" an owner decision (`DECISIONS.md` 2026-09-06).

## Ordering rationale

Wave 0 first because it is mechanical, provable by arithmetic or by a test, and touches no
behaviour — it builds the token-parity guard that later waves depend on. Wave 1 next because it is
the only wave where the app can **lie about data** or **lose a set**. Wave 2 is craft debt with a
real drift mechanism behind it. Wave 3 and 4 are the owner's calls.

---

## Wave 0 — mechanical, high-confidence (one PR)

Each is a `file:line` change with a named test. No behaviour changes.

- **0.1 Error toast fails WCAG AA.** `index.css:192` — `.toast.error { background: var(--danger);
  color: #fff; }` measures **3.76:1**, and at 16px bold the 4.5 floor applies. This is the app's
  only error surface. Fix: darken the fill (`#b91c1c` → 5.88:1) or set dark ink. Extend
  `theme.test.js` to assert `contrastRatio('#fff', danger) >= 4.5`.
  Test: *"error toast text meets WCAG AA against its fill"*.
- **0.2 `theme-color` is the retired palette.** `index.html:6` is `#0a0a12`; `colors.bg` is
  `#0d0d0d`. It is the first pixel of every PWA launch. Fix the value **and** extend the parity
  check to parse `index.html` — otherwise this drifts again.
  Test: *"`index.html` theme-color matches `colors.bg`"*.
- **0.3 Disabled state missing on the classes the timer uses.** Only `.btn-primary:disabled`
  exists (`index.css:97`); `TimerBar`'s four controls use `.btn-icon`/`.btn-secondary`
  (`TimerBar.jsx:57,66-68`), so they keep `cursor: pointer` while `pointerEvents: 'none'` makes
  them inert. Fix: one shared rule. **No `aria-disabled` needed** — verified during execution:
  `TimerBar` already sets the *native* `disabled` attribute on all four buttons, which is
  announced correctly; only the visual half was missing.
  Test: *"`btn-icon` and `btn-secondary` expose a disabled state"*.
- **0.4 `theme-color`-class token drift: four cool-hued hexes survive in a true-neutral system.**
  `index.css:96` (`#2a2a42`, channel spread 24), `:240` (`#23233a`, 23 / `#1a1a2e`, 20), `:85`
  (`#e2e8f0`, 14). `#2a2a42` against its own resting `#2a2a2a` is **1.03:1** — inert, so timer
  press feedback comes only from `opacity`. Fix: re-neutralise and move into `theme.js` so parity
  can cover them.
- **0.5 The parity guard watches colours only.** `theme.test.js:18-31` asserts 10 colour strings;
  `type.size`/`space`/`radius` are unguarded, and `index.css` independently re-spells seven sizes
  (`0.7`, `0.75`, `0.8`, `0.875`, `0.9`, `1rem`, `1.25rem`) plus `2.2rem`, which is **larger than
  `display`.** `theme.js:6-8` claims parity protection that does not exist for sizes.
  Test: *"type scale parity: `theme.js` and `index.css` agree on sizes"*.
- **0.6 Two contrast comments do not reproduce.** `index.css:137` claims 1.12:1, measures 1.05:1;
  `:140` claims 4.96:1, measures 4.62:1. Conclusions hold, numbers are wrong — and these are the
  only contrast figures asserted outside `theme.test.js`.
- **0.7 `Skeleton` is outside the system.** `Skeleton.jsx` imports nothing from `theme.js`;
  hardcodes `borderRadius: 8`; its `height = 16` default is dead (all 10 call sites pass one).

**Boundary:** `index.css`, `index.html`, `theme.js`, `theme.test.js`, `Skeleton.jsx`,
`TimerBar.jsx`. Touches no page and no data path. Verified by the suite plus one browser look at a
disabled timer.

## Wave 1 — the app can lie or lose work (needs the owner's mockup pick)

These are the findings with user-visible consequences. **The mockup asks the owner to choose the
treatment for 1.1, 1.2 and 1.4 — do not start those three before that answer.**

- **1.1 A failed read renders as "you have no data".** `Home.jsx:73` (`.catch(() =>
  setLoading(false))`), `Progress.jsx:36-39`, `History.jsx:85`, `PersonalBests.jsx:42`,
  `activeSession.jsx:27-28`. Four false claims at once: *"No workouts logged yet"*, the **wrong**
  workout day (`getNextWorkoutId([])` → `upper_a`, `workoutPlan.js:322`), and **Resume replaced by
  Start** over a live workout. Amplifiers: the SW rejects at **4s** (`vite.config.js:103`) while
  `api.js` waits 8s, and the read cache is commit-scoped (`apiCacheName.js:8`), so **every deploy
  starts from an empty cache**. `activeSession.jsx:41-44` records this exact harm as the reason it
  was rewritten once; it is back via a different path.
  Fix: a `loadError` beside `loading`; never render an empty state on a rejected fetch; on refresh
  failure leave `active` as-is rather than nulling it.
  Tests: *"Home renders an error state, not an empty state, when the read fails"*; *"Home does not
  offer Start while a session is active and the refresh failed"*; *"Progress distinguishes failed
  from empty"*.
- **1.2 `Log Set` is not idempotent and acknowledges nothing.** `Workout.jsx:301-357`. The only
  guard is `if (logging)`, which misses the window *after* the response. `set_number` is computed
  client-side (`workoutFlow.js:42-46`), `sets` has no uniqueness constraint (`main.py:309-319`) and
  `POST /sessions/{sid}/sets` adds none (`main.py:1090-1093`). A second tap writes **two sets with
  the same `set_number`** — History then reads *Set 1, Set 2, Set 2, Set 3*. The documented retry
  path (8s timeout after the write landed) duplicates a real set. Success is also silent: `showToast`
  fires only for a PR (`:326`).
  Fix: client-generated set id the server ignores on repeat; ~300ms debounce; acknowledge every log.
  Backend test: *"a repeated set id writes one row"*; frontend: *"a double-tap logs one set"*;
  *"a successful log is announced in a live region"*.
- **1.3 Note saves lie when they fail.** `Workout.jsx:381-386` applies the optimistic update before
  the `await` and only toasts on failure, so the note stays on screen looking saved. The corrected
  review fixed the missing `api.put` but kept the optimistic update — and lists the round trip as
  never exercised. Fix: restore the previous value, or mark it unsaved with a retry.
  Test: *"a failed note save restores the previous value"*.
- **1.4 `Finish Workout` is one tap, unconfirmable and un-undoable**, while every sibling
  destructive action is two-tap armed (`:371-379`, `History.jsx:99-114`, `PersonalBests.jsx:65-76`,
  `ResumeBanner.jsx:41-52`). The summary offers only "Done" → Home (`:291`). Reuse the armed
  pattern. Note the 2026-09-06 audit rejected placing it next to *Skip* — this is the missing
  confirm, not the placement.
  Test: *"Finish Workout requires a second tap"*.
- **1.5 A number field cannot be emptied.** `Workout.jsx:137-141`
  (`onChange(Number.isNaN(v) ? min : v)`) writes the minimum on the same keystroke, so clearing reps
  shows `1` and the next digit appends — **18 reps logged instead of 8**. `PersonalBests`' Year
  field snaps to 2026, so typing "14" yields 202614 → 422. Fix: hold the raw string while focused,
  commit on blur/log. Four call sites, one wrapper.
  Test: *"a number field can be cleared and retyped"*.
- **1.6 One `catch` for every failure, including the unfixable.** `Workout.jsx:351-355` says "tap
  Log Set again" for network, 5xx **and** 4xx alike; the backend 422s `reps < 1`, `weight_kg < 0`,
  `> 1000` (`main.py:343-345`), and a 422 can never succeed on retry. Worse, the reps stepper is
  `step: 1`, so a fractional value is unreachable by stepping — the message can demand the
  impossible. Fix: branch on `err.status`.
  Test: *"a 422 shows a value message, not a retry hint"*.
- **1.7 The stale-data indicator is a 12px `aria-hidden` glyph.** `VersionBadge.jsx:89-93` with
  `IconExclamationTriangle.jsx:3` hardcoding `aria-hidden` — the mutation sits inside the
  aria-hidden subtree of the very live region meant to announce it. No text anywhere; the Workout
  screen has none at all. Fix: render words, drop `aria-hidden`, banner Workout while stale.
  Test: *"the stale indicator exposes text to assistive tech"*.

## Wave 2 — system consistency (real drift mechanism)

- **2.1 The token-clean / literal-heavy split is structural.** Every component extracted by the
  design-system initiative (Chip, DisclosureRow, EmptyState, StatPair, Eyebrow, DayAccent) has
  **zero** hardcoded hex; every component not extracted (NavBar, TopBar, Skeleton, TimerBar,
  VersionBadge, DayIcon) is literal-heavy — `gap: 3`, `gap: 5`, `height: 36`, `'5px 14px'`,
  `'12px 16px'`, all with tokens that already exist. Sweep the six.
- **2.2 `.field-label` reimplements `Eyebrow` in CSS** (`index.css:112-115`) — same uppercase, 700,
  `0.08em`. Changing `Eyebrow` silently misses the two auth form labels. Render `<Eyebrow>`.
- **2.3 `.rest-label` is a third uppercase variant at 0.6rem** (`index.css:213`) — **below the
  scale floor** (`xs` = 0.65rem) and tracking `0.1em` matches nothing. This is `REST`/`GO`/`PAUSED`,
  read at arm's length mid-set. Use `0.7rem` + `0.08em`, or route through `Eyebrow`.
- **2.4 The mono stack is spelled out 8× and `theme.js` has no `font` key at all** — while it has
  `colors`, `type`, `space`, `radius`. This is why #229 needed a fifth token group.
- **2.5 `EmptyState`'s comment and code disagree.** `:4-7` says padding 32; `:10` uses
  `space.xxxl` = 24. In a repo whose method is "measured rather than felt", a comment asserting a
  rejected decision is worse than none. **Which is intended was not resolvable from source.**
- **2.6 Smaller bypasses:** `StatPair.jsx:10` `1.5rem` (between `strong` and `title`, matching
  neither); `EmptyState.jsx:11` sets no `fontSize`, so the title renders at the untokenised
  browser default; `DisclosureRow.jsx:56` uses a `∧`/`∨` **text glyph** sized with a text token in
  an all-SVG set, with no `line-height`.

## Wave 3 — accessibility and interaction (needs a browser or a screen reader)

- **3.1 The cues sheet declares `aria-modal` but moves no focus and traps no Tab.**
  `ExerciseCuesModal.jsx:32-37,44` — only Escape is handled; focus stays on the button underneath
  while AT is told the page is hidden. Touch is fine.
- **3.2 Rest-timer completion is a beep and nothing else.** `TimerBar.jsx:33-41` — `vibrate` is
  Android-only, no Notification API anywhere, and the "GO" state has no live region. Add
  `aria-live="polite"`. Notification permission is a real cost — owner's call.
- **3.3 The wake-lock chip disappears at ≤340px** (`index.css:232`), so "is my screen staying on"
  vanishes at exactly the smallest phone widths.
- **3.4 PersonalBests inputs are `0.9rem`** (`index.css:179`), breaking the app's own documented
  16px iOS-zoom floor stated at `index.css:121-124`. `AGENTS.md` records the double-styling
  *conflict* as deferred; the auto-zoom consequence is a distinct functional problem.
- **3.5 NavBar lights Home on tab-less routes.** `NavBar.jsx:20-22` — `?? '/'` sets
  `aria-current="page"` on Home while you are on Workout/Exercise. `TopBar` exists to name exactly
  those two screens. Fix: `?? null`.
- **3.6 `/exercise/:day/:id` is an orphan route** whose Back is `nav(-1)` (`Exercise.jsx:26-30`),
  which on a bookmark or PWA relaunch exits the app, and whose label "Back to workout" is wrong for
  anyone who did not arrive from a workout. Linked from nowhere in app code; only
  `e2e/responsive.spec.js:73` navigates by URL.

## Wave 4 — the owner's calls, and what the reviews could not verify

**Needs a decision:** the toast's 2.5s life and its overlap with the fixed header
(`index.css:186` at `top:20px; z-index:100` vs the header's `45` at `top:0` — it covers the
username and the Finish pill); ±30s silently rewriting the permanent rest default
(`Workout.jsx:438` → `useRestPreference.js:13-20`) while the target is never displayed; warm-up sets
being counted toward `ex.sets` (`Workout.jsx:332-333,581-585`) — copy-only fix, the audit rejected
set-typing as overengineering; dark-only being undocumented (no `prefers-color-scheme` anywhere);
zero `:hover` affordance while the app is also served as a plain web page; and the redundant
double `v <sha>` stamp (the footer one is load-bearing for the runbook, so it needs a doc change).

**Could not verify — needs a browser, a build or a device:** whether #229's icon sizes fit the
77px nav; perceived contrast under gym lighting (findings 0.1 and 2.3 both depend on it); optical
weight across the icon set (three different techniques — flat fill, evenodd knockouts, and one
stroke-based icon); whether the toast/header overlap reads as broken; screen-reader output for 3.1
and 1.7; iOS caret behaviour that turns 1.5's refill into concatenation; and the wake-lock `release`
lifecycle — i.e. whether the `⚡ On` chip can ever be a lie.

## Deliberately not doing

The offline write queue and warm-up/drop-set typing were both explicitly declined by the
2026-09-06 audit and are not re-argued here. Nothing in this tracker touches auth, deploy, backup or
the service worker's cache strategy — Wave 1 and 2 are UI-only and carry no schema change, so no
export snapshot and no restore drill is required for them.

---

## What has shipped (2026-10-03, later session)

Four commits on `design/wave0-tokens`, branched from `claude/import-auth-hardening`. Every item
below is red-first: the test fails with the fix reverted, and each new guard was verified by
reintroducing the defect it exists to catch.

| item | state | note |
|---|---|---|
| 0.1 error toast contrast | shipped earlier (#235) | |
| 0.2 `theme-color` | shipped earlier (#235) | |
| 0.3 disabled state | shipped earlier (#235) | |
| 0.4 stray hues | **done** | plus the finding that `.btn-icon:active` was 1.03:1 against its own resting fill — a pressed control that was not |
| 0.5 size parity | **done, differently** | the plan's "theme.js and index.css agree on sizes" is not checkable — `type.size` has no `:root` counterpart. Shipped as an allowlist with per-entry reasons, scanned across **inline styles too**, where three of the five off-scale values actually were |
| 0.6 contrast comments | **done** | 1.12→1.05, 4.96→4.63, and a test that re-derives both |
| 0.7 Skeleton | **done** | token radius; dead `height = 16` default removed |
| 1.1 failed read | **done, wider than planned** | six sites, not four. An independent pass found the worst one is not on this list at all: `Workout.jsx` did `.catch(() => nav('/'))`, throwing you out of your own live workout |
| 1.2 idempotency | **partly** | the honest-failure half shipped with 1.6. The `client_id` key needs a schema change, so it is a separate deploy with an export snapshot and a restore drill — **and it invalidates this document's own closing claim that Wave 1 carries no schema change** |
| 1.3 note saves | **done** | the finding was not the lie, it was that `setEditingNote(null)` ran before the `await` and destroyed the typed words |
| 1.4 Finish confirm | **open** | mockup pick still outstanding; the pass argues an un-finish path beats a confirm |
| 1.5 clearable numbers | shipped earlier (#235) | |
| 1.6 one catch | **done** | branches on `err.status`; the no-status branch keeps the retry hint *and* tells you to check the set list |
| 1.7 stale indicator | **done, and cheaper than planned** | the `aria-hidden` was on the `<svg>`, not the live region — so this was a copy fix, not an a11y-mechanism one |

### Found outside this tracker

- **The iOS 16px focused-input floor was missing on the note textarea** (`Workout.jsx`, 0.8rem).
  It is the only focusable text control in the app without it, and it is the one you focus *between
  sets*. Reported by the owner using the app; no review had caught it. Now 1rem, with a guard that
  walks every `<textarea>` and text `<input>` in `src` — resolving inline sizes, spread style
  objects and CSS classes — and fails if any lands under 16px or cannot be resolved at all.
- **`Home.jsx`'s `/exercises/recency` failure** was a fifth false empty state: the muscle-group
  picker was being handed `[]`, which reads as "you have never trained anything".
- **The skeleton-height question** (do the ten hand-guessed heights match what the real content
  occupies?) is unanswered and is not answerable from source. A mis-tap on Log Set is the failure
  mode if they are wrong. Costs one throttled load to check.

### What could not be done here

**No rendered screen was looked at.** Chromium will not execute in an Alpine/musl sandbox —
`unsupported relocation type 1032` under `gcompat`, which is the same family of problem the
Dockerfile's arm64 builder has. Every visual judgement above is therefore unverified, and this
repo's own rule (DECISIONS.md 2026-09-06) says a UI change is not done until someone has looked at
it. `frontend/e2e/review-shots.spec.js` is the handoff: it drives the changed screens, saves a
screenshot of each at 390px and 320px, and prints the computed sizes and colours that source review
cannot see. Run it on a machine with a working browser:

```
cd frontend && REVIEW_SHOTS=1 REVIEW_PASS='<the local dev password>' npx playwright test e2e/review-shots.spec.js
```

Three calls in particular want eyes: whether Home's new error state reads correctly at 320px,
whether "Data may be old" crowds the TopBar's username, and whether the danger-coloured "· not
saved" is visible at all inside an exercise card that dense (if it is not, revert the text on
failure instead of marking it).
