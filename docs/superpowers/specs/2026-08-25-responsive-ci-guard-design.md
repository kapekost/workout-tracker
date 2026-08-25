# Responsive-regression CI guard

**Date:** 2026-08-25
**Status:** Proposed, not yet shipped.
**Research:** [`../research/2026-08-17-design-system-inventory.md`](../research/2026-08-17-design-system-inventory.md) §6 (R0), [`../audits/2026-06-30-responsive-catalog.md`](../audits/2026-06-30-responsive-catalog.md)
**Execution record:** [`../plans/2026-08-25-responsive-ci-guard.md`](../plans/2026-08-25-responsive-ci-guard.md)
**Depends on:** Upgrade 1 landed (stable ground to test against); the final task depends on Upgrade 3's new components existing.

---

## Problem

The 2026-06-30 responsive audit fixed 13 defects (R1-R13), enforcing a ≥44px tap-target / no-horizontal-overflow-at-320px floor. The inventory's §6 (R0) found this floor has exactly **one** automated assertion in the entire suite (`MuscleGroupPicker.test.jsx:166-167`) and **no CI at all** — no `.github/workflows` exists in this repo. Every other fix (TimerBar's 3 breakpoint tiers, the stepper wrap, the `.tap-target` `::after` hit-area hack) is protected only by a human remembering the magic number is load-bearing. The inventory calls this out explicitly: "any centralisation lands without a net" — exactly the risk Upgrades 2 and 3 (which touch the same files) create if this isn't closed first.

`jsdom` (this repo's existing test environment, via Vitest) does not compute real CSS layout or evaluate `@media` queries, so it cannot verify a breakpoint actually engages at a given viewport width — only a real browser can. This session's environment has Chromium pre-installed for Playwright; a GitHub Actions runner does not have it pre-installed and needs its own setup step.

## Scope

**In:**
- Add `@playwright/test` as a new devDependency — the first new dependency introduced by any of these five upgrades; called out explicitly rather than treated as routine.
- A small Playwright suite (`frontend/e2e/responsive.spec.js`) asserting, at a 320×568 viewport, against the dev server:
  1. No horizontal scroll (`document.documentElement.scrollWidth <= document.documentElement.clientWidth`) on Home, Workout, History, Progress, Exercise.
  2. `.tap-target`, `.btn-icon`, and `NavBar`'s nav items each have a computed bounding-box height ≥44px (`getBoundingClientRect()`).
  3. `TimerBar`'s three breakpoint tiers actually engage at their trigger widths (≤440px, ≤340px) — resize the viewport mid-test and assert the `.timer-pill`/`.btn-icon` widths named in the audit.
- A new `.github/workflows/frontend-tests.yml` running, on every push and PR: `npm test` (Vitest), then `npx playwright install --with-deps chromium` followed by the new Playwright suite.
- Document the guard in `AGENTS.md`'s Status/Design-docs section.

**Out (this task only, lands once Upgrade 3 ships):**
- Extending the Playwright suite to cover Upgrade 3's new `<Chip>`/`<DisclosureRow>`/`<EmptyState>` components specifically — sequenced as this plan's last task, after Upgrade 3 exists.

**Explicitly not in scope for this upgrade at all:**
- Fixing any regression the new tests happen to catch beyond what's already guaranteed by the 2026-06-30 audit — if a genuine, pre-existing defect surfaces, report it rather than silently fixing it inside a "test infrastructure" PR (keeps "did this change behavior" review clean, same principle every other upgrade in this initiative follows).

## Guardrail
This upgrade is additive only. No application code changes except where a test proves an actual, real regression was introduced by Upgrades 1-3 landing before this one — in which case, fix forward and say so explicitly, don't weaken the assertion to make it pass.

## Testing
The new suite itself *is* the testing artifact. `cd frontend && npm test` (Vitest) stays the fast unit-level gate; the new Playwright suite is a separate, slower `npm run test:e2e` script, run in CI and optionally locally, not folded into the existing `npm test` command (keeps the ~2s Vitest feedback loop this repo's AGENTS.md explicitly values).

## References
- [`../research/2026-08-17-design-system-inventory.md`](../research/2026-08-17-design-system-inventory.md) §6
- [`../audits/2026-06-30-responsive-catalog.md`](../audits/2026-06-30-responsive-catalog.md) — the 13 defects (R1-R13) this guard protects
