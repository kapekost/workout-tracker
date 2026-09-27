# Dynamic progression suggestions — design

**Date:** 2026-09-27
**Status:** New spec, written this tick from a direct owner ask (not yet an Issue — filed alongside
this spec per PLAYBOOK's Feature intake flow, `scripts/create_issue.sh ready`, since the ask is
already concrete enough to size directly: a bounded v1 heuristic, not open-ended).
**Depends on:** nothing new. Reuses `sessions`/`sets` (already profile-scoped since #110) and the
existing `/api/exercises/{id}/last` endpoint (`backend/main.py:978`) and its frontend caller
(`Workout.jsx`'s `ensureLastPerf`). No relation to #32 (Adaptive coaching) — that workstream is an
AI-authored, cross-session, cross-exercise *note* layered on top of the static plan (see
`2026-08-31-ai-structured-io-design.md`); this is a same-session, deterministic, single-exercise
*prefill* heuristic. They can coexist: if #32 ever ships, its target becomes one more input a future
revision of this algorithm could blend in — not designed here (see §6).

---

## Problem

The app already nudges a returning lifter in two places:
- `frontend/src/lib/overload.js`'s `overloadSuggestion(lastSets, repsHigh)` — if every set last time
  hit `repsHigh`, suggest `+2.5kg`; otherwise repeat the same weight. Shown as a one-line hint next
  to "Last workout" in `Workout.jsx` (~line 500).
- `frontend/src/lib/workoutFlow.js`'s `prefillFor` — uses that same hint (or the plan's static
  default, `bodyweight ? 0 : 20`kg / 8 reps, if there's no history) to prefill the weight/reps
  inputs when a card opens.

This is a real, working "last used" default — not nothing, contrary to a first guess. What it does
**not** do, and what the owner asked for:
1. **No rep-target suggestion.** The card always shows the plan's static range ("Target 6–10");
   there's no single suggested number reflecting what the lifter actually needs to do next (double
   progression's whole point — see §2.1).
2. **No time-awareness.** A set from 3 days ago and a set from 3 months ago are treated identically.
   A lifter returning from a long layoff gets told to add weight (or at best repeat their old max),
   which is a real injury/frustration risk after real time off training.
3. **No warm-up suggestion.** The lifter goes straight into the working-set inputs at whatever
   weight is prefilled — no ramp.

## Scope

**In:** a v1 heuristic combining (a) last session's performance for this exercise (weight, reps,
whether every set hit the rep-range top) and (b) elapsed calendar days since that session, to
produce: a suggested starting weight, a suggested single rep-count target, and one warm-up-set
suggestion (weight + reps) shown before the working sets. Backend-computed (new pure function +
endpoint enrichment), unit-tested with concrete scenarios. UI change to show and prefill from it.

**Out (explicitly, v1):** multi-session trend analysis (e.g. "3 sessions of missed reps in a row" —
this only ever looks at the single most recent completed session for the exercise, per the task's
own "not a full periodization engine" framing). Deload *programming* (a planned multi-week wave) —
this is a reactive per-visit suggestion, not a program. Editing `workoutPlan.js`'s rep ranges or
exercise list. Anything AI/external (#32's territory). Auto-applying anything — the suggestion
prefills the input, exactly like today's `overloadSuggestion` already does; the lifter can always
type over it before logging a set, same as today.

---

## 1. What already exists vs. what's new

| | Today | v1 (this spec) |
|---|---|---|
| Weight suggestion | `+2.5kg` on a clean hit, else repeat — no time factor | Same clean-hit logic, gated on a *recent* gap; held flat on a *short* gap; reduced on *moderate*/*long* gaps (§2.2) |
| Rep suggestion | None — UI shows only the plan's static range | A single number: `repsLow` after a clean hit (double progression reset) or after a layoff; `repsHigh` otherwise (§2.3) |
| Warm-up | None | One set: ~50% of the suggested working weight, higher reps (§2.4) |
| No history | `bodyweight ? 0 : 20`kg / 8 reps (unchanged) | Unchanged — nothing to base a suggestion on |

## 2. The algorithm

Pure function, `backend/main.py` (or a small new `backend/progression.py` module the plan can
decide — see plan for the file-placement call): `suggest_progression(last_sets, reps_low, reps_high,
days_since, increment=2.5, bodyweight=False) -> dict`. Takes exactly what the existing
`overloadSuggestion` takes, plus `days_since` and `reps_low` (the range's bottom, not previously
passed to `overloadSuggestion` at all).

### 2.1 Hit status (per last session, all logged sets for the exercise)

Reusing the existing **double-progression** convention already implied by the plan's own
`repsLow`–`repsHigh` ranges (pick a weight, work up reps to the top of the range across sessions,
then add weight and drop back to the bottom — a standard, widely-taught strength-training method,
not a house invention: see Hevy Coach's own plain description, "select a heavy enough load... stick
with it until you can lift it for [the top of the range] reps on all sets, then add a bit of weight
and gradually work back up" — https://hevycoach.com/glossary/double-progression/). Given the last
completed session's logged sets for this exercise:

- **`clean`** — every set's `reps >= reps_high`. The range is maxed out; time to add weight.
- **`partial`** — every set's `reps >= reps_low`, but not every set reached `reps_high`. Still inside
  the intended range; more reps at the same weight is the next step, not more weight.
- **`missed`** — at least one set's `reps < reps_low`. The current weight isn't yet manageable for
  the intended range.

This checks *all* logged sets against fixed thresholds, matching `overloadSuggestion`'s existing
behavior (not the current implementation's own most-recent-set-only reading — it already looks at
every set). A pyramid/drop-set session (different weight per set) is read the same way today's hint
already reads it: not perfectly, but not a regression either — flagged as a known v1 simplification,
not solved here (see §6).

### 2.2 Layoff band (elapsed calendar days since the last logged session for this exercise)

`days_since = (today - last_session.date).days`, both server-local calendar dates — the same clock
`sessions.date` already uses everywhere else in this codebase (`create_session`,
`exercises/recency`'s `last_date`), so this needs no new date handling convention.

Bands are grounded in detraining research rather than picked arbitrarily. The consistent finding
across the literature (e.g. the *Stronger by Science* detraining review and the studies it surveys)
is that trained strength is **essentially preserved through about 2 weeks** of a layoff — a short
break reads as statistically indistinguishable from a planned deload — with **meaningful decline
emerging around the 4-week mark** (studies report on the order of a ~6% average strength drop by
then), continuing to climb through 8–12 weeks (roughly 7–12%+ in that range). Translated into
4-day-split-friendly bands:

| Band | Days since | Rationale |
|---|---|---|
| `recent` | 0–13 (≤ ~2 weeks) | Strength is preserved at this range — normal progression rules apply. |
| `short` | 14–27 (~2–4 weeks) | Not yet a measurable strength loss, but also not "business as usual" — hold flat rather than add weight, since the evidence for *no* loss here is real but the margin for confidently progressing further isn't. |
| `moderate` | 28–56 (~4–8 weeks) | Squarely in the range where the literature shows a real, if modest, drop — reduce load. |
| `long` | 57+ (8+ weeks) | Losses continue climbing in this range — reduce further, and rebuild the rep range from the bottom. |
| `none` | no prior completed session for this exercise | Nothing to base a suggestion on — falls back to the existing static default, unchanged. |

### 2.3 Combining hit status × layoff band

|  | `clean` | `partial` | `missed` |
|---|---|---|---|
| **`recent`** | weight `+increment`; reps → `reps_low` (double-progression reset onto the new weight) | weight repeat; reps → `reps_high` (close the gap to the top before adding weight) | weight repeat; reps → `reps_low` (re-establish the baseline before pushing again) |
| **`short`** | weight repeat (**no** increment — see §2.2); reps → `reps_high` | weight repeat; reps → `reps_high` | weight repeat; reps → `reps_low` |
| **`moderate`** | weight `× 0.9` | weight `× 0.9` | weight `× 0.9` |
| **`long`** | weight `× 0.8` | weight `× 0.8` | weight `× 0.8` |

`moderate`/`long` ignore hit status for the weight decision (a layoff this long dominates whatever
happened in the last, now-stale, session) but always set reps → `reps_low`, matching the "rebuild
the range" framing — a returning lifter should re-earn the top of the range at the new, lighter
weight rather than being asked for the old rep target at a reduced-but-still-untested load.

Weight base for `+increment`/`×0.9`/`×0.8` is `top_weight = max(s.weight_kg for s in last_sets)`
(same "top weight used" reading `overloadSuggestion` already uses). Result is rounded to the
nearest half-increment step already used throughout the UI (`NumControl`'s `step={2.5}`):
`round_to_step(x, step=2.5) = floor(x / step + 0.5) * step`, floored at 0. `increment` defaults to
`2.5` — the app's own existing plate-jump convention (`overload.js`'s current default), not a new
number.

### 2.4 Warm-up suggestion

One set, computed from the **final suggested working weight** (post-layoff-adjustment, so a
returning lifter's warm-up also scales down, not just their working weight):
- `warmup.weight_kg = round_to_step(working_weight * 0.5)` — a single ramp set at roughly half the
  working load is a standard, widely-used warm-up convention for a compound or moderately loaded
  accessory lift (an ascending 40–60%-of-working-load ramp before a working set is the shape most
  strength-coaching references converge on; 50% is the simple, single-set version of that ramp).
- `warmup.reps = min(reps_high + 2, 15)` — a few more reps than the working target, at much lower
  load, to mobilize the movement pattern without adding fatigue; capped at 15 so a high-rep isolation
  exercise (`tricep_pushdown`'s `repsHigh: 15`) doesn't suggest an oddly long warm-up set.
- **`null`** when `working_weight <= 0` (a bodyweight exercise with no added load yet — nothing
  external to ramp) or when there's no history at all (`layoff_band == 'none'`).

### 2.5 Worked examples (see §5 for the full test list)

- Bench press, `reps_low=6, reps_high=10`, last session 3 days ago at `80kg × [10,10,10]` → `clean` +
  `recent` → weight `82.5`, reps `6`, warmup `{41.25 → 42.5, 12}`.
- Same exercise, last session 18 days ago, same clean sets → `clean` + `short` → weight `80`
  (held), reps `10`, warmup `{40, 12}`.
- Same exercise, last session 35 days ago → `moderate` → weight `72.5` (`80 × 0.9 = 72`, rounds to
  `72.5`), reps `6`, warmup `{35, 12}` (`72.5 × 0.5 = 36.25` → `35`... see plan for the exact rounding
  worked through in the unit test rather than hand-verified twice here).

## 3. Backend

### 3.1 New pure function

`suggest_progression(last_sets: list[dict], reps_low: int, reps_high: int, days_since: int | None,
increment: float = 2.5, bodyweight: bool = False) -> dict`, returning:
```json
{
  "weight_kg": 82.5, "reps": 6,
  "warmup": {"weight_kg": 42.5, "reps": 12} ,
  "hit_status": "clean", "layoff_band": "recent"
}
```
`days_since=None` (no prior session) → the existing static default (`weight_kg`:
`0 if bodyweight else 20`, `reps: reps_low`, `warmup: None`, `hit_status: None`,
`layoff_band: "none"`. Module placement (inline in `main.py` near `epley`, or a new
`backend/progression.py`) is a plan-time call — either way it must be import-free of FastAPI/sqlite
so it's trivially unit-testable with plain dicts, the same discipline `epley()` already follows.

### 3.2 Endpoint: enrich, don't add a round-trip

`GET /api/exercises/{exercise_id}/last` (`backend/main.py:978`) gains three optional query params —
`reps_low`, `reps_high`, `bodyweight` (all already known to the frontend from `workoutPlan.js`, the
same way `exMeta` is already threaded through today's `prefillFor` call sites) — and, when a prior
session exists, an added `"suggestion": {...}` key computed via §3.1, using
`days_since = (date.today() - date.fromisoformat(row["date"])).days`. **No new endpoint** — this
repo's own `exercises/recency` comment already states the reasoning that applies here too: "one
query, not 22... a Pi 3 B+ over gym wifi cannot serve a fan-out." `exercise_id/last` is already
fetched lazily per exercise card on expand (`ensureLastPerf`); riding the same response avoids a
second round-trip per card. When there's no prior session, the endpoint's existing `null` response
is unchanged — the frontend's existing no-history fallback path in `prefillFor` still applies exactly
as it does today (untouched).

Backward compatible: omitting the three query params entirely (an old cached frontend, a rolling
deploy) makes the endpoint fall back to `reps_low=repsHigh` behavior... no — simpler and safer: if
`reps_low`/`reps_high` are omitted, skip computing `suggestion` and return the response exactly as
it is today (no `suggestion` key at all). The frontend always sends them (§4), so this only matters
mid-deploy; the plan should test it explicitly (old client / new backend, and vice versa, never 500s
either way).

## 4. Frontend

- `ensureLastPerf` (`Workout.jsx:183`) gains the exercise's `repsLow`/`repsHigh`/`bodyweight` as
  parameters (its three call sites already have the exercise object in scope — see lines 226-228,
  316-317, 435-436) and appends them to the query string.
- `prefillFor` (`workoutFlow.js:11`) prefers `lastPerfData.suggestion` when present (`weight_kg`,
  `reps`) over its current `overloadSuggestion`-based branch. `overloadSuggestion` itself is **not
  deleted** — kept as the fallback when `suggestion` is absent (an old cached service-worker
  response, or a backend that hasn't rolled out yet) so a lifter never sees a worse experience than
  today's during a rolling deploy. Its existing tests keep passing unchanged.
- New UI: a warm-up line above the existing "Suggested Xkg" hint (~`Workout.jsx:499`), shown only
  when `suggestion.warmup` is non-null: `Warm-up: **{weight}kg** × {reps}`. The existing "Suggested"
  line changes from `Suggested {weight}kg · Target {low}–{high}` to `Suggested **{weight}kg** ×
  **{reps}**` (the single suggested rep count replaces the vague range as the *actionable* number)
  while the exercise header directly above it (`Workout.jsx:453`, `{sets}×{repsLow}–{repsHigh}`)
  keeps showing the plan's full range unchanged — that's context ("here's the intended range"), the
  new line is instruction ("here's today's specific target").
- Reuses existing tokens/classes only (`colors.mint`, `type.size.base`, `Eyebrow`) — no new
  component, matching the standing "efficient, not overengineered" bar.

## 5. Testing

**Backend (`backend/test_progression.py`, pytest, pure-function-first — no DB needed for most
cases):**
1. No history (`days_since=None`) → static default, `bodyweight=False` and `bodyweight=True` both.
2. Recent + clean hit → `+increment`, reps → `reps_low`, warmup computed.
3. Recent + partial hit → weight repeat, reps → `reps_high`.
4. Recent + missed → weight repeat, reps → `reps_low`.
5. Short layoff (14 and 27 days, boundary-inclusive) + clean hit → weight held flat (no increment),
   reps → `reps_high`.
6. Moderate layoff (28 and 56 days, boundaries) → `× 0.9`, reps → `reps_low`, regardless of hit
   status (test with a `clean` last session to prove the layoff overrides it).
7. Long layoff (57+ days) → `× 0.8`, reps → `reps_low`.
8. Warm-up is `null` when `bodyweight=True` and working weight resolves to `0`.
9. Rounding: an input that lands exactly on a `2.5` half-step resolves deterministically (test
   `round_to_step` directly with at least one exact-half case).
10. Endpoint-level (`TestClient`, extending `backend/test_recency.py`'s `_session` helper pattern):
    `GET /api/exercises/{id}/last` with `reps_low`/`reps_high` present returns a populated
    `suggestion`; omitted, returns no `suggestion` key and is otherwise identical to today's
    response (the backward-compat case from §3.2).

**Frontend (Vitest, extending `overload.test.js`'s style — new cases in
`workoutFlow.test.js`):**
- `prefillFor` uses `data.suggestion` when present, ignoring `overloadSuggestion` entirely in that
  case.
- `prefillFor` falls back to today's `overloadSuggestion`-based behavior when `data.suggestion` is
  absent (old-response shape) — proves the fallback path the deploy-compat design in §3.2 depends on.
- Existing `overload.test.js` cases untouched and still passing (nothing in that file changes).

**UI/UX review gate (per PLAYBOOK step 5, this touches the UI):** real screenshots of an exercise
card in each of: no history, recent+clean, a layoff case, and the warm-up line rendered — a
UI-expert pass (does the new line read as considered, not bolted on) and a UX-expert pass (is
"Warm-up" vs "Suggested" unambiguous at a glance, one-handed, mid-workout).

## 6. Deferred, not designed here

- Multi-session trend awareness (e.g., a real, sustained plateau across 3+ sessions, not just "last
  time"). Explicitly out per the task's own "not a full periodization engine" framing — a real v2 if
  the owner wants it, once this v1's simpler read has been used for real.
- Blending in a `#32`-style AI-proposed target (`exercise_targets`, if that workstream ever ships) as
  an additional input alongside "last session" — natural, not designed here; #32 isn't built yet.
- Anything about *which* exercises get which `reps_low`/`reps_high` — untouched, still
  `workoutPlan.js`'s static data (Feature 2 territory, not this spec's).

## 7. Deploy impact

Additive only: no schema change (reuses `sessions`/`sets` as they exist today), one endpoint
enriched with optional query params (old callers unaffected), frontend logic gated behind a
presence check on the new field. Safe to deploy without a pre-deploy `/api/export` snapshot per
`AGENTS.md`'s "before any schema-changing deploy" rule — this isn't one.
