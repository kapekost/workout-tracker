# Muscle-Group Picker + Recovery Estimate — Implementation Plan

> **EXECUTED 2026-08-16.** All 8 tasks shipped to `main`; both suites green.
> This file is now a record, not instructions.
>
> The original 1,718-line version carried full code and test listings for every
> task. Those listings are superseded by the shipped source — edit the real
> files, never this document. Recover the full text from commit `c582ba0` if
> you need to see what was specified versus what landed.

**Goal:** Let the user pick a muscle group on Home, see how long since each group
was trained, and see an animated estimate of how far each group's training
stimulus has decayed.

**Design:** [`../specs/2026-08-16-muscle-group-recovery-design.md`](../specs/2026-08-16-muscle-group-recovery-design.md)
**Evidence:** [`../research/2026-08-16-recovery-science.md`](../research/2026-08-16-recovery-science.md)

---

## What shipped

| Commit | Task | Source of truth now |
|---|---|---|
| `8ae06b1` | Guard unknown `workout_day` | `frontend/src/pages/Workout.jsx` |
| `32e61fb` | `GET /api/exercises/recency` | `backend/main.py`, `backend/test_recency.py` |
| `fe3bbe9` | Taxonomy + pattern-based τ | `frontend/src/lib/muscles.js` |
| `acc7032` | Day scoring + `bestDayForMuscle` | `frontend/src/lib/muscles.js` |
| `d4b9de0` | Stimulus-decay model | `frontend/src/lib/recovery.js` |
| `af6c19e` | Picker component + ring | `frontend/src/components/MuscleGroupPicker.jsx` |
| `eeeb9a3` | Grid-track hardening | same |
| `1234e58` | Wired into Home | `frontend/src/pages/Home.jsx` |
| `507be8a` | Changelog + AGENTS.md | — |

Tests went 42 → 49 backend, 62 → 135 frontend.

## Decisions that live only here

Everything else is now readable from the spec, the research, or the code. These
three are not:

- **Why two modules, not one.** `muscles.js` changes when the workout plan
  changes; `recovery.js` changes when the research changes. Different reasons,
  different test styles — table-driven versus clock-driven.
- **Why only the most recent bout per exercise is summed.** A bout two sessions
  back contributes ≤1.8% at τ ≤ 24 h, below the resolution of three bands. The
  `min()` cap therefore applies per bout rather than per session, because τ
  varies per exercise and a session is not one term.
- **Why an unclassified exercise gets the longest τ.** The error budget is
  one-directional — unlogged classes can only make the estimate *overstate*
  freshness — so the fallback must read as more recently trained, never fresher.

## Corrections found during execution

The plan was written before the code existed and got two things wrong. Both are
fixed in the shipped source; recorded here so they are not "re-fixed" back:

- **The `Workout.jsx` bug's symptom.** The plan said an unguarded
  `PLAN[s.workout_day].exercises` throws a `TypeError` that kills the page. It
  throws, but the effect's own `.catch(() => nav('/'))` swallows it and bounces
  the user to Home — which is *why* the render-path "Unknown workout day."
  fallback was unreachable.
- **The ring's colour ramp.** The plan specified a slate→green lerp. Freshness
  is a magnitude, so the ring is a sequential encoding and the spec's own rule
  is single-hue; two hues violated it. Shipped as a single-hue emerald ramp,
  monotonic in lightness, ending on the app's existing `--mint`. The plan
  explicitly authorised `dataviz` to override ramp endpoints.

## Stale cross-references

Section numbers in the original text ("spec §4.5", "spec §6.3", "spec §7") point
at a longer draft of the spec that was condensed in `12ad2a7`. The decisions
match; only the numbering moved.

## Not done

Deploy. The Pi still runs `e1366a9`. No schema change, so no migration and no
restore re-drill — see the deploy runbook in `AGENTS.md`.
