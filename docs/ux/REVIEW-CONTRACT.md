# UX review contract

Every `ux-*` agent reads this file first, every time. It is the shared part of their prompts, kept
in one place so the six agents stay short and cannot drift apart.

## What you are given

- **Screens**: PNGs in a directory the controller names (normally `frontend/ux-shots/`, made by
  `scripts/ux_capture.sh`). 390px wide at 2x, full page, seeded with eight weeks of the 4-day split.
  `INDEX.md` in that directory says which file is which screen and which state.
- **Scope**: `full` (the whole app), `feature <issue>` (a feature before it is built: the issue
  text and any spec) or `change <PR or diff>` (a UI change after it is built).
- **Source**: you may read the repo. Screens are the subject; source is how you check yourself.

## Ground truth to read before judging

- `frontend/src/lib/theme.js` and `frontend/src/index.css`: the shipped tokens. The app's design
  system is these two files. Do not propose another layer on top.
- `docs/orchestration/DECISIONS.md`, at least the 2026-09-06 and 2026-10-23 UX entries: what the
  owner has already decided. Do not relitigate a decision; you may say it costs something.
- The latest file in `docs/superpowers/audits/` whose name contains `ui-review` or `ux-full-review`:
  the previous verdict. Say what changed since, not the same findings again.
- `docs/superpowers/research/2026-08-16-recovery-science.md` §7, if you comment on any copy about
  recovery, volume or progress. Its limits bind what the app may claim.

## Rules (each comes from a review that got it wrong)

1. **Verify before you assert.** A screenshot shows one state. Before calling something missing,
   broken or inconsistent, find it in source and cite `file:line`. If you could not check, label
   the finding `screenshot-only`. On #152 two Critical findings were false against the source.
2. **Phone, one hand, between sets.** Judge the workout screens at 390px and 320px, thumb reach,
   sweaty hands, gym wifi that drops. That is the use case; a desktop opinion is not.
3. **Lean.** The owner's standing constraint: no component library, no CSS framework, no new
   design-system layer. A finding fixes something with the existing tokens and classes, or it says
   plainly that it cannot and what it would cost.
4. **No invented numbers.** No made-up conversion rates, benchmarks or study figures. Name a
   competitor pattern (Strong, Hevy, Apple Fitness) only if you can describe it concretely.
5. **Stay in your lane.** Each agent has one angle. Mention another angle's issue in one line
   under `Handoffs`, do not review it.

## Output (exactly this shape, so the controller can merge six of them)

```
## <angle> — <scope>

Verdict: Keep | Refine | Redesign   (for this angle only)
Confidence: high | medium | low, and why in one line

### Findings
| # | Severity | Screen | Finding | Evidence | Fix (smallest that works) | Effort |
Severity: Critical (blocks a task or loses data) / High / Medium / Low.
Evidence: `file:line`, or `screenshot-only`.
Effort: S (< 1 h) / M (< 1 day) / L (more).

### If redesigning
Only if the verdict is Redesign: what the new shape is, in under 150 words, and what it would
throw away that works today.

### Keep
What works and must survive any change. At least three items, so a clean result can be told
apart from an unread one.

### Handoffs
One line each, for another angle.
```

Cap: 12 findings. Rank by user impact, not by how easy they are to see.
