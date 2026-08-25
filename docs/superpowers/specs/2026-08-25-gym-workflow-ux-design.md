# Real UX and layout fixes for the gym workflow

**Date:** 2026-08-25
**Status:** Proposed, not yet shipped.
**Research:** [`../research/2026-08-17-design-system-inventory.md`](../research/2026-08-17-design-system-inventory.md) (I13-I17), AGENTS.md Backlog, [`../backlog/2026-08-16-next-workstreams.md`](../backlog/2026-08-16-next-workstreams.md)
**Execution record:** [`../plans/2026-08-25-gym-workflow-ux.md`](../plans/2026-08-25-gym-workflow-ux.md)
**Depends on:** Upgrade 3 landed (consumes `<EmptyState>`/`<Eyebrow>`); Upgrade 4's Playwright harness, if landed by the time this starts, is reused for the final smoke pass but isn't a hard blocker.

---

## Problem

Two kinds of already-evidenced, already-deferred gaps remain once the design-system work (Upgrades 1-4) lands:
1. **One surviving deferred UI item** from the 2026-06-30 responsive sweep: an idle rest-timer hint, named in AGENTS.md's Backlog since that sweep shipped and never picked up.
2. **Five dimensional/layout bugs** the design-tokens spec found and explicitly declined to fix (its own "Out of scope" section, I13-I17) because they're layout logic bugs, not color/type/spacing value swaps — this upgrade is where that logic actually gets fixed.

Plus one open opportunity named in the backlog itself but never acted on: `docs/superpowers/backlog/2026-08-16-next-workstreams.md` names the `dataviz` skill as "the right tool for chart/meter work" for this app; it's never been applied to `Progress.jsx`'s `recharts` usage.

## Scope

**In:**

1. **Idle rest-timer hint.** `TimerBar` currently shows `READY` / `—:—` when no rest is active. Before any set has been logged this session, change the idle copy to something like "Log a set to start rest timer" — exact copy TBD during implementation, matching the app's existing tone (short, imperative). Needs a way to distinguish "idle, no sets logged yet" from "idle, between rests after logging sets" — check `activeSession.jsx`/`sessionStats.js` for what's already tracked before inventing new state.

2. **I13 — `.timer-bar` vs. content-column max-width mismatch** (480px vs 448px). Pick one source of truth: make `.timer-bar`'s `max-width` reference the same `28rem` value `.page-shell` uses (Upgrade 2), rather than two independently-typed numbers that happen to almost agree. Verify in a browser that the 32px difference was actually invisible before (the audit didn't catch it as a defect) and stays invisible after — this is a single-source-of-truth fix, not necessarily a visible one.

3. **I14 — doubled bottom padding on `Workout.jsx`** (`page-shell`'s 96px + `Workout.jsx`'s own explicit `paddingBottom: 96` = 192px). Before removing either, measure the actual rendered gap between the last card and the bottom nav/timer-bar on a real device or devtools — `Workout.jsx` may legitimately need more clearance than other pages (it's the one screen with both `TimerBar` and `NavBar` visible simultaneously), so verify whether removing the redundant 96px leaves enough room before deleting it. Fix forward only once confirmed; if `Workout.jsx` genuinely needs ~192px of clearance, document why in a comment instead of leaving an unexplained-looking duplicate.

4. **I15 — `.toast`'s `max-width: calc(100vw - 32px)`** hardcodes 2× the `.page-shell` gutter (16px) with no link between them. Fix: express it in terms of the same gutter value, so a future gutter change can't silently desync it again. No rendered change.

5. **I16 — `.timer-bar`'s `bottom: calc(64px + safe-area)`** vs. `NavBar`'s actual measured box (~76px per the inventory's arithmetic). **Verify in a real browser first** — the inventory itself flags this as "worth verifying... before treating as a defect." If there's a visible gap or overlap between `TimerBar` and `NavBar`, fix the constant; if not, document why it's fine as-is rather than changing a number that isn't actually broken.

6. **I17 — inconsistent safe-area handling.** `NavBar.jsx:19`'s flat `20px` bottom padding vs. `TimerBar`'s `env(safe-area-inset-bottom)`. Move `NavBar` onto `env(safe-area-inset-bottom)` too (added to a smaller base pad), so both correctly adapt to notched vs. non-notched devices instead of one being a fixed guess.

7. **Progress-screen dataviz pass.** Load the `dataviz` skill and apply its guidance to `Progress.jsx`'s existing `recharts` `LineChart` (colors already on `theme.js` after Upgrade 1) — mark choice, gridline treatment, tooltip contrast, axis legibility at the small sizes this app uses (`fontSize: 11` ticks). Scope to what `dataviz` actually flags as a real issue, not a wholesale chart redesign.

8. **Apply `<EmptyState>`/`<Eyebrow>`** (Upgrade 3) to any screen the inventory flagged as inconsistent but that fell outside Upgrade 3's literal call-site list (re-check after Upgrade 3 lands — likely nothing left, but confirm).

**Out:**
- Any change to `RecoveryRing`'s ramp, or the protected 44px/320px magic numbers themselves (only I13 and I16 touch numbers adjacent to that floor, and both require the "verify before fixing" discipline above specifically because of that adjacency).
- New features. This is a bug-fix and polish pass on existing, already-evidenced gaps — not a place to add scope.

## Guardrails
- I16 and the parts of I13 adjacent to the tap-target floor require a **verify-in-browser-first** step before any code changes — the inventory itself is explicitly unsure whether they're real defects.
- Frontend only.
- Every new/changed style value pulls from `theme.js`/`space` (Upgrade 1) where one exists for it; don't reintroduce a hardcoded literal fixing one inconsistency by creating another.

## Testing
Each of I13-I17 gets a short before/after note in its commit message (what was measured, what changed). The rest-timer hint gets a real test (extending `TimerBar.test.jsx`'s existing 4-state coverage from Upgrade 1 with a 5th "no sets logged yet" state). Final task: a real-browser 320px smoke pass — reuse Upgrade 4's Playwright suite if it's landed by then, otherwise manual devtools — re-confirming the 7 previously-shipped UX fixes (touch/scroll, timer states and sound, bodyweight defaults, overload prefill, cues sheet, stepper hold-repeat, rest-timer persistence) plus everything this upgrade touched.

## References
- [`../specs/2026-08-23-design-tokens-design.md`](../specs/2026-08-23-design-tokens-design.md) — "Out, found and evidenced, but not fixed here" section, source of I13-I17's deferral
- [`../research/2026-08-17-design-system-inventory.md`](../research/2026-08-17-design-system-inventory.md) — I13-I17 with exact file:line citations
- AGENTS.md Backlog — the idle rest-timer hint item
- [`../backlog/2026-08-16-next-workstreams.md`](../backlog/2026-08-16-next-workstreams.md) — the `dataviz` skill recommendation
