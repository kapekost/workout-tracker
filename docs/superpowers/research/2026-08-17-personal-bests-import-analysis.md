# Importing historical Personal Bests — how PRs work today and what each approach would cost

**Date:** 2026-08-17
**Status:** RESEARCH ONLY. No code, schema, or config was changed. This document does **not**
pick an approach — it lays out what each one touches so the owner can decide.
**Scope:** answers the crux question in
`docs/superpowers/backlog/2026-08-16-next-workstreams.md:120-123` — *"If a PB is imported with
no session behind it, how does it interact with PR detection?"*

---

## Summary — five things that decide this

1. **There is no PR store.** Every PR is derived on the fly from `sets` INNER JOINed to
   `sessions WHERE s.completed = 1` — in `session_prs` (`backend/main.py:337-343`),
   `all_progress` (`backend/main.py:242-247`), `get_progress` (`backend/main.py:223-232`),
   `last_performance` (`backend/main.py:277-281`) and `exercises_recency`
   (`backend/main.py:306-330`). Five queries, one convention. Any PB that isn't a row in `sets`
   attached to a completed `sessions` row is invisible to all five.

2. **The 2026-06-30 "baseline" rule is a pure absence test, and an imported PB flips it.**
   `session_prs` emits `{"type": "baseline"}` when `psets` is empty — no prior completed sets
   for that exercise (`backend/main.py:350-353`). Whichever approach is chosen, once a PB
   exists for an exercise, the first in-app session for it stops being a "baseline" and starts
   being judged against the PB. That is arguably correct, but it is a behavioural change to a
   shipped, tested rule (`backend/test_main.py:36-43`).

3. **A synthetic session is free on the write side and expensive on the read side.** It needs
   zero changes to PR logic, `/api/export`, `/api/import`, or any query — but it is
   indistinguishable from a real workout to `/api/sessions`, History, the Progress chart's
   session count, the volume-PR pool, the muscle-recovery model, and the next-workout rotation.
   Three columns default to *now* (`sessions.created_at` `backend/main.py:69`, `sets.logged_at`
   `backend/main.py:79`) — get either wrong and **yes, a 2023 lift makes a muscle read as
   "Recently trained" today** (mechanism traced in §5.4).

4. **A separate table is clean on the read side and forks the comparison in five places.**
   Nothing session-derived is polluted, but the PB must be unioned into `session_prs`'s `psets`,
   `all_progress`'s `max_weight` (which Workout.jsx turns into the live PR toast,
   `frontend/src/pages/Workout.jsx:123-130`), and the Progress page's own PR badge, which is
   computed client-side from chart points only (`frontend/src/pages/Progress.jsx:42`). Miss one
   and the app shows two different "personal records" on two screens. It also forces a schema
   migration + an `/api/export` envelope change, and the import validator at
   `backend/main.py:413` would then **reject every existing backup JSON** (§6.2).

5. **Nothing in the app is idempotent except `PUT /note` and `POST /api/import` itself.**
   There is no UNIQUE constraint anywhere in the schema (`backend/main.py:63-87`); the only
   indexes are non-unique (`backend/main.py:55-58`). A double submission duplicates rows
   silently. It will *not* manufacture a false PR (every comparison is strict `>`), but it does
   inflate the Progress "Sessions" counter, duplicate History cards, and silently cancel the
   recovery model's novelty multiplier (§8).

---

## 1. How PRs are computed today

### 1.1 The `s.completed = 1` join convention

Five endpoints read training data, and all five join through `sessions` with the same predicate.
There is no shared helper — the string is repeated:

| Endpoint | Location | Predicate |
|---|---|---|
| `GET /api/progress/{exercise_id}` | `backend/main.py:228` | `WHERE st.exercise_id = ? AND s.completed = 1` |
| `GET /api/progress` | `backend/main.py:245` | `WHERE s.completed = 1` |
| `GET /api/exercises/{id}/last` | `backend/main.py:279` | `WHERE s.completed = 1 AND st.exercise_id = ? AND s.id != ?` |
| `GET /api/exercises/recency` | `backend/main.py:320` | `WHERE s.completed = 1` |
| `GET /api/sessions/{sid}/prs` | `backend/main.py:339`, `:343` | `WHERE s.completed = 1 AND s.id != ?` / `WHERE s.completed = 1` |

The convention is documented in-line as deliberate at `backend/main.py:220-221`,
`backend/main.py:237-240` and `backend/main.py:294-297`, and tested at
`backend/test_review_fixes.py:58-66` and `backend/test_recency.py:36-39`.

`completed` is set only by `PATCH /api/sessions/{sid}` (`backend/main.py:179-184`), which also
stamps `ended_at` via `COALESCE` so re-completing is stable
(`backend/test_main.py:18-22`).

**Consequence for an ingest route:** an imported row must live in `sets` under a `sessions` row
with `completed = 1`, or it does not exist as far as PRs, charts, prefill, and recovery are
concerned. There is no third state.

### 1.2 `session_prs` — the only place a "PR" is named

`backend/main.py:333-371`. It reads three result sets and computes four PR types plus the
baseline marker. Nothing is persisted; this is called once, at Finish
(`frontend/src/pages/Workout.jsx:245`).

The three reads (`backend/main.py:336-343`):

```python
cur_sets = conn.execute("SELECT exercise_id, exercise_name, weight_kg, reps FROM sets WHERE session_id = ?", (sid,)).fetchall()
prior = conn.execute(
    "SELECT st.exercise_id, st.weight_kg, st.reps FROM sets st "
    "JOIN sessions s ON s.id = st.session_id WHERE s.completed = 1 AND s.id != ?", (sid,)).fetchall()
# session volumes for the volume PR
vol_rows = conn.execute(
    "SELECT st.session_id, SUM(st.weight_kg*st.reps) v FROM sets st "
    "JOIN sessions s ON s.id = st.session_id WHERE s.completed = 1 GROUP BY st.session_id").fetchall()
```

Note `cur_sets` (`:336`) has **no** `completed` filter — the current session is still in flight
when the frontend calls this, so it is read unconditionally. `prior` (`:337-339`) is the entire
completed history of every exercise, unbounded, loaded into Python and filtered per exercise at
`backend/main.py:350`.

The four comparisons, all strict `>`:

| Type | Line | Rule |
|---|---|---|
| `baseline` | `backend/main.py:350-353` | `if not psets:` → emit one baseline entry for the exercise and `continue` (skips all three metric checks) |
| `weight` | `backend/main.py:355-357` | `cur_w > max(p["weight_kg"] for p in psets)` |
| `reps` | `backend/main.py:359-362` | reps at the session's top weight, **only** if `prior_reps_at_w` is non-empty — i.e. we have lifted exactly that weight before |
| `1rm` | `backend/main.py:363-365` | `max(epley(...)) > max(epley(...))` over prior sets |
| `volume` | `backend/main.py:367-370` | `if cur_vol and prior_vols and cur_vol > max(prior_vols)` — session-level, `exercise_name: None` |

`epley` is `round(weight * (1 + reps / 30) * 2) / 2` (`backend/main.py:270-271`) — rounds to the
nearest 0.5 and is unit-blind.

### 1.3 The baseline mechanism (the 2026-06-30 feature)

Spec: `docs/superpowers/specs/2026-06-30-responsive-audit-pr-baseline-design.md:12-77`. Shipped
per `docs/CHANGELOG.md:125-126`. The principle it states verbatim (spec line 33):

> **A PR requires a prior value to beat. No prior value = baseline = no PR.**

Before the fix, every guard read `if not psets or cur_w > …`, so a first-ever entry fired a
weight PR *and* a reps PR *and* a 1RM PR (spec lines 16-30). The fix inverted it: no prior
history → exactly one `baseline` entry, keyed on the **exercise** having no prior completed
sets, not per metric (spec lines 38-50).

The backend half is `backend/main.py:350-353`:

```python
psets = [p for p in prior if p["exercise_id"] == ex_id]
# No prior completed history for this exercise → baseline, not a PR.
if not psets:
    prs.append({"type": "baseline", "exercise_name": info["name"], "value": None, "unit": None})
    continue
```

The frontend half is the *muting*, in the finish summary
(`frontend/src/pages/Workout.jsx:149-160`):

```jsx
const isBaseline = p.type === 'baseline'
return (
  <p key={i} style={{ color: isBaseline ? '#9ca3af' : '#fbbf24', fontSize: '0.8rem' }}>
    {isBaseline ? prLabel(p) : `🎉 New PR — ${prLabel(p)}`}
  </p>
)
```

`prLabel` renders a baseline as `"{name} — baseline set"` with no emoji
(`frontend/src/pages/Workout.jsx:63`); real PRs get gold `#fbbf24` and the 🎉 prefix.

There is a **second, independent PR path** that never sees `baseline`: the live in-workout toast
(`frontend/src/pages/Workout.jsx:187-195`), which compares against the `prs` map seeded from
`/api/progress` at mount (`frontend/src/pages/Workout.jsx:123-130`):

```jsx
const prevMax = prs[ex.id]
if (prevMax == null || weight > prevMax) {
  setPrs(prev => ({ ...prev, [ex.id]: weight }))
  if (prevMax != null) { // Only show if there was a previous record
    showToast(`🏆 PR! ${weight}kg on ${ex.name}`)
  }
}
```

`prevMax == null` → state updates but **no toast**. That is the client-side equivalent of the
baseline rule, and the `!= null` (not falsy) check is deliberate so a genuine 0 kg record counts
(`backend/main.py`-side note at `frontend/src/pages/Workout.jsx:187-188`; regression fixed per
`docs/CHANGELOG.md:112`).

A third, weaker copy lives in `frontend/src/lib/sessionStats.js:14-16` — `summarize()` filters
`prsBefore[id] == null || best.weight > prsBefore[id]`, which *keeps* first-ever entries in its
`prs` array. That array is currently unused by the summary render (Workout renders
`summary.serverPrs`, not `summary.prs`, at `frontend/src/pages/Workout.jsx:151`), so it is dead
weight — but it is a fourth place the notion "prior best" is encoded.

**Tally: four independent definitions of "prior best" already exist** —
`session_prs.psets`, `Workout.jsx` `prs` map from `/api/progress`, `Progress.jsx`'s chart-derived
`pr`, and `sessionStats.summarize`. Any PB source must be plumbed into all of them or they
disagree on screen.

### 1.4 `all_progress` and `get_progress`

`all_progress` (`backend/main.py:242-247`) is the exercise picker **and** the seed for the live
PR toast:

```sql
SELECT st.exercise_id, st.exercise_name, MAX(st.weight_kg) as max_weight
FROM sets st JOIN sessions s ON st.session_id = s.id
WHERE s.completed = 1
GROUP BY st.exercise_id, st.exercise_name ORDER BY st.exercise_name
```

Two properties matter for an import:

- **`GROUP BY exercise_id, exercise_name`** — the *pair*. If an import writes the same
  `exercise_id` under a different `exercise_name` (`"Bench"` vs `"Bench Press"`), this returns
  **two rows for one exercise**: two chips in the Progress picker
  (`frontend/src/pages/Progress.jsx:58-71`), and in `Workout.jsx:124-127` the second row
  *overwrites* the first in `prMap` — so the live PR threshold becomes the max of whichever name
  sorts last, not the true max. `SetIn.exercise_name` is free text up to 128 chars
  (`backend/main.py:102`); nothing enforces the id→name mapping.
- The endpoint comment (`backend/main.py:239-240`) states `max_weight` exists precisely so the
  workout page "can build its PR baseline from this one call instead of one request per
  exercise" — a Pi-3-driven constraint (`docs/superpowers/backlog/2026-08-16-next-workstreams.md:162-163`).

`get_progress` (`backend/main.py:223-232`) is one point per completed session:

```sql
SELECT date, max_weight, reps FROM (
    SELECT s.date as date, MAX(st.weight_kg) as max_weight,
           st.reps as reps, s.id as sid
    FROM sets st JOIN sessions s ON st.session_id = s.id
    WHERE st.exercise_id = ? AND s.completed = 1
    GROUP BY s.id, s.date
    ORDER BY s.date DESC, s.id DESC LIMIT 60
) ORDER BY date ASC, sid ASC
```

`reps` is a bare column beside a single `MAX()`, so SQLite yields the reps of the max-weight row
— and the frontend ignores it anyway (`frontend/src/pages/Progress.jsx:35`). The `LIMIT 60`
window keeps the **most recent** 60 sessions (`backend/test_review_fixes.py:38-48`), so bulk
historical imports fall out of the chart rather than pushing recent data out.

---

## 2. What the frontend does with `/api/progress`

### 2.1 `/api/progress` (list)

- `frontend/src/pages/Progress.jsx:28` → the chip picker; an exercise appears only if it has
  completed history (`backend/test_review_fixes.py:173-179`).
- `frontend/src/pages/Workout.jsx:123-130` → `prsAtStart.current` + `prs` state → live PR toast
  threshold, and `prefillFor`'s last-resort weight (`frontend/src/lib/workoutFlow.js:18-19`:
  `if (pm != null) return { weight: pm, reps: 8 }`).

### 2.2 `/api/progress/{id}` (chart)

`frontend/src/pages/Progress.jsx:34-37`:

```jsx
api.get(`/progress/${selected}`).then(d => {
  setData(d.map(r => ({ date: r.date.slice(5), weight: r.max_weight })))
```

Three chart facts that bear directly on the decision:

1. **`date.slice(5)` drops the year.** A 2023 PB renders as `07-14`, indistinguishable from
   2026-07-14, and two entries from different years collide on one label.
2. **The X axis is categorical, not temporal** (`frontend/src/pages/Progress.jsx:109`,
   `<XAxis dataKey="date" …>` on a plain `LineChart`). Points are evenly spaced regardless of
   elapsed time, so a three-year gap draws exactly as wide as a three-day gap.
3. **The "Personal Record" badge is client-side and chart-derived**
   (`frontend/src/pages/Progress.jsx:42`): `const pr = data.length ? Math.max(...data.map(d => d.weight)) : null`,
   rendered at `frontend/src/pages/Progress.jsx:78-93` next to a **"Sessions"** count that is
   literally `data.length` (`frontend/src/pages/Progress.jsx:89`). A PB that isn't a chart point
   cannot appear in this badge without a code change, and a PB that *is* a chart point
   increments the session count.
4. `data.length < 2` shows "Log at least 2 sessions to see a trend"
   (`frontend/src/pages/Progress.jsx:101-104`) — one imported PB alone silences that message.

---

## 3. Everything else that reads sessions

| Consumer | File:line | Reads | Sensitive to a synthetic session? |
|---|---|---|---|
| Resume / active-session detection | `frontend/src/lib/activeSession.jsx:4-7` | `sessions.find(s => !s.completed)` | Yes — a synthetic row left `completed = 0` becomes a phantom "resume this workout" |
| Next-workout rotation | `frontend/src/data/workoutPlan.js:319-325` | `sessions[0].workout_day` | Yes — `sessions[0]` is `ORDER BY created_at DESC` (`backend/main.py:162`); an unknown day returns `'upper_a'`, resetting the cycle |
| Home "Last session" card | `frontend/src/pages/Home.jsx:77-78`, `:164-177` | `sessions[0]` | Yes — same ordering |
| Home "Last workout N days ago" | `frontend/src/lib/recovery.js:139-145` | max `s.date` over completed | Uses `date`, so a backdated row is harmless |
| Muscle picker day suggestion | `frontend/src/pages/Home.jsx:18-27` (`lastTrainedByDay`) | completed sessions whose `workout_day` is in `CYCLE` | Filtered by `CYCLE.includes(...)` — an out-of-cycle synthetic day is ignored |
| History list | `frontend/src/pages/History.jsx:130-153` | `/api/sessions` (max 60, `backend/main.py:162`) | Yes — synthetic rows appear as cards; `plan?.name ?? s.workout_day` (`:145`) and the `?? '#6ee7b7'` colour fallback (`:132`) mean an unknown day degrades gracefully |
| History delete | `frontend/src/pages/History.jsx:58-63` → `backend/main.py:191-197` | — | Yes — the user can delete an imported PB from History with a two-tap confirm and no distinct warning |

The 60-row cap on `/api/sessions` (`backend/main.py:162`) is shared by History, Home, and
`findActiveSession`. Importing more than 60 sessions **with `created_at` left at its default of
now** (`backend/main.py:69`) would push a genuine in-progress session out of the window and break
Resume.

---

## 4. Muscle-group recovery — would a fabricated session read as "recently trained"?

**Yes, unless `sets.logged_at` is explicitly backdated.** Trace:

- `exercises_recency` returns `last_at` from `MAX(st.logged_at)` (`backend/main.py:311`) and
  `last_date` from `s.date` (`backend/main.py:310`) — deliberately two clocks
  (`backend/main.py:302-304`).
- `sets.logged_at` has `DEFAULT (datetime('now'))` (`backend/main.py:79`). `POST /api/sessions/{sid}/sets`
  never sets it (`backend/main.py:204-206`), so any ingest that reuses that insert shape stamps
  **today**.
- `recovery.js` turns `last_at` into decay: `hours = hoursSince(r.last_at, nowMs)`,
  `decay = Math.exp(-hours / tau)`, `load += min(1, sets*w/6) * novelty * decay`
  (`frontend/src/lib/recovery.js:96-102`), `freshness = 1 - min(1, load)`
  (`frontend/src/lib/recovery.js:122`).
- `tau` is 12/18/24 h by movement pattern (`frontend/src/lib/muscles.js:42-46`). With
  `hours ≈ 0`, `decay = 1`; three imported sets of a compound lift give
  `min(1, 3/6) × 1.5 × 1 = 0.75` load → freshness 0.25 → band **"Recently trained"**
  (`frontend/src/lib/recovery.js:68-73`) for a lift performed in 2023.

Correctly backdated, the same row is benign: `exp(-8760/24) ≈ 0`, load ≈ 0, freshness ≈ 1. But
two second-order effects remain:

- The group flips from **"Not trained yet"** to **"Fresh"** with a `daysSinceLabel` of
  e.g. "412 days ago" (`frontend/src/lib/recovery.js:119-133`, `:49-55`). Not a lie, but new copy.
- **Novelty is silently cancelled if the PB date is within 28 days of the first real session.**
  `noveltyFor` returns 1.5 when `prev_date` is absent *or* the gap is ≥ 28 days, else 1.0
  (`frontend/src/lib/recovery.js:59-64`). A synthetic session becomes `prev_date` (rn = 2,
  `backend/main.py:314-317`, `:326-327`), so a recent-ish PB drops the multiplier and the model
  reports the muscle as fresher. That direction is inside the spec's stated one-directional
  error budget (`docs/superpowers/specs/2026-08-16-muscle-group-recovery-design.md:137`), so it
  is safe-but-wrong rather than unsafe.
- `hoursSince` clamps negatives to 0 (`frontend/src/lib/recovery.js:27-31`), so an AI that
  misreads a date into the future produces `decay = 1` — the worst case above.

A separate `personal_bests` table is invisible to `exercises_recency` by construction and has
none of these effects.

---

## 5. Approach (a) — synthetic session

**Shape:** one `sessions` row (`completed = 1`, backdated `date` + `created_at`) plus one or more
`sets` rows with backdated `logged_at`, per imported PB.

### 5.1 What needs no change at all

- `session_prs` — the PB lands in `prior` (`backend/main.py:337-339`) automatically, so weight /
  reps / 1RM comparisons work with zero new code.
- `all_progress` / `get_progress` / `last_performance` / `exercises_recency` — all pick it up.
- `/api/export` (`backend/main.py:397-404`) and `/api/import` (`backend/main.py:406-453`) — the
  `TABLES` list (`backend/main.py:10`) is unchanged, `schema_version` stays 2, and every backup
  JSON in Drive remains restorable. This is approach (a)'s single largest advantage.
- `frontend/src/lib/sessionStats.js`, `workoutFlow.js`, `Progress.jsx`, `Workout.jsx` — untouched.

### 5.2 What changes behaviourally without any code being edited

- **Baseline disappears for imported exercises** (`backend/main.py:350`), and the first real
  session is judged against the PB. Note the asymmetry this creates with the reps rule
  (`backend/main.py:359-362`): a reps PR requires *prior reps at exactly the current top weight*,
  so if the PB is 100 kg × 3 and the user later does 100 kg × 5, they get a reps PR from a number
  an AI extracted from a note — the reps value has to be trustworthy, not just the weight.
- **Volume PRs get a new competitor** (`backend/main.py:341-343`, `:367-370`). A one-set PB
  session has trivially low volume and is harmless; importing a *full* historical session sets a
  session-volume bar that a real workout must beat. If the imported session is exaggerated, the
  volume PR becomes permanently unreachable.
- **Progress chart gains a point** at the PB's date, with the year stripped
  (`frontend/src/pages/Progress.jsx:35`) on a categorical axis
  (`frontend/src/pages/Progress.jsx:109`). A 2023 point sits one tick left of a 2026 point. The
  chart doesn't lie about *values*, but it does lie about *time spacing*, and the label is
  ambiguous.
- **"Sessions" counter inflates** (`frontend/src/pages/Progress.jsx:89`).
- **History shows the synthetic session as a workout** and offers to delete it
  (`frontend/src/pages/History.jsx:130-157`, `:58-63`). There is no field to mark a session as
  imported, so no way to style or protect it without a schema change — which forfeits the
  "no migration" advantage.
- **`SessionIn.workout_day` is a `Literal` of the four plan days** (`backend/main.py:94-98`) but
  the DB column has no CHECK (`backend/main.py:66`). An ingest route could write
  `workout_day = 'imported'`; `CYCLE.includes` filters it out of the day suggestion
  (`frontend/src/pages/Home.jsx:20`) and History degrades gracefully (`:145`), but
  `getNextWorkoutId` returns `'upper_a'` if the *most recent* session's day isn't in `CYCLE`
  (`frontend/src/data/workoutPlan.js:322-324`) — harmless only while `created_at` is backdated.

### 5.3 The three columns that must be explicitly set

| Column | Default | If left at default |
|---|---|---|
| `sessions.completed` | `0` (`backend/main.py:68`) | Row is invisible to all PR queries *and* becomes a phantom Resume target (`frontend/src/lib/activeSession.jsx:6`) |
| `sessions.created_at` | `datetime('now')` (`backend/main.py:69`) | Becomes `sessions[0]` → hijacks next-workout rotation, the Home "Last session" card, and can evict a real session from the 60-row window |
| `sets.logged_at` | `datetime('now')` (`backend/main.py:79`) | Muscle group reads **"Recently trained"** (§4) |

`sessions.date` is `NOT NULL` with no default (`backend/main.py:66`), so it can't be forgotten.

### 5.4 Verdict on (a)

Cheapest to build, and the only option that keeps the disaster-recovery path untouched. The cost
is that the app's core noun — "a session I did" — stops being true, and every screen that counts
or lists sessions inherits a small lie. None of those lies is individually severe; there are
about six of them.

---

## 6. Approach (b) — separate `personal_bests` table

**Shape:** a new table (e.g. `exercise_id`, `exercise_name`, `weight_kg`, `reps`, `achieved_on`,
`source`), consulted by the PR comparison.

### 6.1 Backend changes required

1. **Migration.** `_migrate` (`backend/main.py:37-59`) gains a `v < 3` block and
   `PRAGMA user_version = 3`. Per `AGENTS.md:104-107` and
   `docs/superpowers/backlog/2026-08-16-next-workstreams.md:70-74`, a schema change makes a
   pre-deploy `/api/export` snapshot **mandatory** and requires a restore drill (last drill
   2026-07-09, `AGENTS.md:199-201`).
2. **`session_prs`.** The minimum-fork version is to append PB rows into `psets` after
   `backend/main.py:350`, giving weight / reps / 1RM comparisons for free — but note the PB row
   must carry a `reps` value for the 1RM comparison at `backend/main.py:364` and the
   reps-at-weight lookup at `backend/main.py:360` to behave. A PB recorded as "100 kg, reps
   unknown" has to be assigned a reps value or excluded from two of the three checks. Volume PRs
   (`backend/main.py:367-370`) have no PB analogue and would stay session-only.
3. **`all_progress`.** Unless `max_weight` accounts for PBs, the live in-workout toast
   (`frontend/src/pages/Workout.jsx:190`) fires "🏆 PR!" at 65 kg while the user's imported best is
   100 kg — and `prefillFor` (`frontend/src/lib/workoutFlow.js:18-19`) prefills the wrong weight.
   Folding PBs in means either a `UNION ALL` subquery or a `MAX(MAX(sets), MAX(pb))`, which also
   makes exercises with a PB but no sessions appear as picker chips (a change to
   `backend/test_review_fixes.py:173-179`'s expectation).
4. **`get_progress` / the Progress badge.** The badge is `Math.max` over chart points
   (`frontend/src/pages/Progress.jsx:42`). Either the endpoint returns the PB separately and the
   page renders it (new UI: an imported-PB marker, e.g. a `ReferenceLine`), or the Progress page
   keeps showing a "Personal Record" that is lower than the one the workout page enforces.
5. **`exercises_recency`** stays untouched — correct by construction. This is (b)'s clearest win.

### 6.2 The export/import blast radius

This is the sharpest concrete hazard on this side, and it is worth quoting. `backend/main.py:10`:

```python
TABLES = ["sessions", "sets", "exercise_notes", "events"]
```

`/api/export` builds its envelope from that list (`backend/main.py:402`), and `/api/import`
**validates that every name in it is present** (`backend/main.py:413`):

```python
if not isinstance(env["tables"], dict) or any(t not in env["tables"] for t in TABLES):
    raise HTTPException(400, "envelope missing expected tables")
```

Adding `"personal_bests"` to `TABLES` therefore makes **every existing backup JSON — the nightly
Drive uploads, the pre-deploy snapshots, the `data/pre-import-*.db`-adjacent exports —
un-importable**, failing with `400 envelope missing expected tables`, unless the file is
hand-edited to add an empty `"personal_bests": []`. Since `/api/import` is the documented
disaster-recovery mechanism (`AGENTS.md:192-198`,
`docs/superpowers/backlog/2026-08-16-next-workstreams.md:100-103`), this is a data-safety
regression, not a cosmetic one. It is fixable — make the presence check lenient for tables
introduced after a given `schema_version`, or default missing tables to `[]` — but the fix must
be deliberate and tested, not discovered during a restore.

Secondary: restoring an *older* envelope sets `PRAGMA user_version` back to the old value
(`backend/main.py:448`) while leaving the newly-created `personal_bests` table in place (import
only `DELETE`s from `TABLES`, `backend/main.py:440`). The next process start re-runs `_migrate`
from that older version; the existing blocks are `CREATE TABLE IF NOT EXISTS` /
`_column_exists`-guarded (`backend/main.py:34-35`, `:46-58`) so a v3 block must be written to the
same idempotent standard.

Tests that break on the envelope change:

- `backend/test_foundations.py:88` — `assert set(exp["tables"].keys()) == {"sessions", "sets", "exercise_notes", "events"}`
- `backend/test_foundations.py:89` — `assert exp["schema_version"] == 2`

### 6.3 The forking risk, stated concretely

The backlog's own phrasing is "the PR logic forks into two code paths"
(`docs/superpowers/backlog/2026-08-16-next-workstreams.md:123`). Made specific: after (b) there
are **five** places that answer "what is the best for this exercise" —
`session_prs.psets` (`backend/main.py:350`), `all_progress.max_weight`
(`backend/main.py:243`), `Workout.jsx`'s `prs` map (`frontend/src/pages/Workout.jsx:123-130`),
`Progress.jsx`'s badge (`frontend/src/pages/Progress.jsx:42`), and
`sessionStats.summarize` (`frontend/src/lib/sessionStats.js:14-16`). Today all five agree because
all five ultimately derive from the same `sets`+`completed` join. After (b) they agree only if
each is updated; there is no shared function to update once. (b)'s real cost is not the migration
— it is that the union must be pushed into every one of them, and a future sixth reader will
default to the *wrong* one.

---

## 7. Units — `weight_kg` everywhere, and where a conversion would have to live

**Storage:** `sets.weight_kg REAL NOT NULL` (`backend/main.py:78`). Validation:
`weight_kg: float = Field(ge=0, le=1000)` (`backend/main.py:105`). There is **no unit column
anywhere** in the schema (`backend/main.py:63-87`), and no unit setting in the frontend.

**Every read and display assumes kg:**

- Derived server-side: `epley` (`backend/main.py:270-271`), `volume_kg` in recency
  (`backend/main.py:313`), session volume for the volume PR (`backend/main.py:342`), and the
  literal `"unit": "kg"` / `f"@{cur_w}kg"` strings returned by `session_prs`
  (`backend/main.py:357`, `:362`, `:365`, `:370`).
- Hardcoded in the UI: `frontend/src/pages/Progress.jsx:16` (tooltip), `:83` (PR badge),
  `:110` (`<YAxis unit="kg">`); `frontend/src/pages/History.jsx:50`;
  `frontend/src/pages/Workout.jsx:64`, `:66`, `:67`, `:147`, `:193`, `:381`, and the input label
  `"Weight (kg)"` at `:405`.

**Where conversion must live:** at ingest, before the `INSERT` — the value written to
`sets.weight_kg` (or to a `personal_bests.weight_kg`) must already be kilograms. Storing a unit
per row would require touching all thirteen display sites above *plus* the export envelope, so it
is a much larger change than it looks.

Three specific hazards:

1. **The validator cannot catch a unit error.** `le=1000` (`backend/main.py:105`) is ~2205 lb.
   A payload of `405` meaning pounds passes validation and is silently stored as 405 kg — an
   impossible lift recorded as fact. The only defence is the review-before-commit step the
   backlog already calls for (`docs/superpowers/backlog/2026-08-16-next-workstreams.md:111-114`).
2. **Converted values are not round, and the UI renders raw floats.** 225 lb × 0.45359237 =
   102.05828325. `History.jsx:50` interpolates `{st.weight_kg}kg` with no formatting, and
   `prefillFor` feeds the stored max straight into the weight stepper
   (`frontend/src/lib/workoutFlow.js:18-19`) whose step is 2.5
   (`frontend/src/pages/Workout.jsx:406`). A rounding policy at ingest (nearest 0.5 or 2.5, and
   which direction) is a decision, not an implementation detail — rounding *up* manufactures a PR
   the user never hit.
3. **A "1RM" PB is not a 1-rep set.** Storing "1RM 140 kg" as 140 kg × 1 makes
   `epley(140, 1) = 144.5` (`backend/main.py:270-271`), so the app's own estimated-1RM record
   becomes 3.3% higher than the true 1RM the user reported. Either the schema needs to
   distinguish "measured 1RM" from "a set of 1", or the ingest must store it in a way that
   round-trips through Epley.

---

## 8. Idempotency — what happens today if the same data is submitted twice

**There is no uniqueness anywhere.** The schema declares only `PRIMARY KEY AUTOINCREMENT` on
`sessions`/`sets`/`events` and `exercise_id` as PK on `exercise_notes`
(`backend/main.py:63-87`); the only indexes created are non-unique
(`backend/main.py:55-58`). `POST /api/sessions/{sid}/sets` inserts unconditionally
(`backend/main.py:204-206`), as does `POST /api/sessions` (`backend/main.py:153-154`) and
`POST /api/events` (`backend/main.py:380-382`).

Idempotent today: `PUT /api/exercises/{id}/note` (upsert, `backend/main.py:261-264`) and
`POST /api/import` itself, which is idempotent only because it wipes first
(`backend/main.py:440`) — verified by `backend/test_foundations.py:100-109`.

Effects of a double submission, per surface:

| Surface | Effect of exact-duplicate data |
|---|---|
| `session_prs` weight/reps/1RM | **No false PR.** All comparisons are strict `>` (`backend/main.py:356`, `:361`, `:364`) — equal is not greater |
| `session_prs` volume | No false PR across duplicate *sessions* (`>` at `backend/main.py:369`), but duplicated sets **within one session** double `cur_vol` (`backend/main.py:367`) and can manufacture one |
| `all_progress` | Unchanged (`MAX`) |
| `get_progress` / Progress chart | Two points with the **same** X label (`frontend/src/pages/Progress.jsx:35`), and the "Sessions" count doubles (`:89`) |
| History | Two identical cards (`frontend/src/pages/History.jsx:130`) |
| `exercises_recency` | Duplicate *within* a session doubles `sets` (`backend/main.py:312`) → load saturates → freshness understated. Duplicate *as a second session* makes the twin `prev_date` (`backend/main.py:314-317`) with a 0-day gap → `noveltyFor` returns 1.0 instead of 1.5 (`frontend/src/lib/recovery.js:59-64`) → freshness **over**stated |
| `/api/export` | Envelope grows; round-trip still exact (`backend/test_foundations.py:107-109`) |

**Implication for an ingest route:** the natural dedupe key for a PB is
`(exercise_id, weight_kg, reps, achieved_on)`, and neither approach gets it for free — approach
(a) would need a UNIQUE index or a pre-insert lookup on `sets`+`sessions` (awkward, since a real
workout may legitimately repeat those exact values on a later date), approach (b) would get it
naturally from a UNIQUE constraint on the new table. That is a real, if narrow, point in (b)'s
favour. Either way the backlog's review-before-commit requirement
(`docs/superpowers/backlog/2026-08-16-next-workstreams.md:111-114`) is the primary defence, since
the same notes re-read by an AI will not produce byte-identical JSON anyway.

---

## 9. Side-by-side

| Dimension | (a) Synthetic session | (b) Separate `personal_bests` table |
|---|---|---|
| **PR detection (`session_prs`)** | Zero code change — PB enters `prior` automatically (`backend/main.py:337-339`) | Must union PB rows into `psets` after `backend/main.py:350`; PB needs a `reps` value for the 1RM (`:364`) and reps-at-weight (`:360`) checks |
| **Baseline rule** | Changes: `psets` non-empty → no baseline (`backend/main.py:350-353`) | Same change, but explicit and controllable (you can choose to keep emitting baseline) |
| **Volume PR** | PB session joins the volume pool (`backend/main.py:341-343`); an exaggerated import sets an unbeatable bar | Untouched — PBs have no session volume |
| **`all_progress` / live PR toast** | Correct automatically (`frontend/src/pages/Workout.jsx:123-130`) | Wrong unless `max_weight` unions PBs — toast fires below the real best |
| **Progress chart** | Gains a point; year stripped (`Progress.jsx:35`), categorical axis compresses a 3-year gap to one tick (`:109`), "Sessions" count inflates (`:89`) | Chart stays honest; but the "Personal Record" badge (`:42`) misses the PB until new UI is added |
| **`/api/export` + `/api/import`** | **No change.** `TABLES` (`backend/main.py:10`) and `schema_version` stay put; all existing backups remain restorable | `TABLES` grows → `backend/main.py:413` **rejects every old backup** unless the presence check is relaxed; breaks `test_foundations.py:88-89`; needs a restore drill (`AGENTS.md:199-201`) |
| **Schema migration** | None | Required (`_migrate`, `backend/main.py:37-59`) — first migration in the project's history (`docs/superpowers/backlog/2026-08-16-next-workstreams.md:66-68`) |
| **Recovery model (`/api/exercises/recency`)** | **Reads as "Recently trained" if `sets.logged_at` is left at its `datetime('now')` default** (`backend/main.py:79` → `frontend/src/lib/recovery.js:96-102`). Correct when backdated, but flips "Not trained yet" → "Fresh" and can cancel the novelty multiplier (`recovery.js:59-64`) | Invisible by construction — the query only reads `sets`+`sessions` (`backend/main.py:306-330`) |
| **History display** | Appears as a real workout card (`History.jsx:130-153`), deletable with two taps (`:58-63`), with no field to mark it imported | Absent from History; needs its own UI surface to be viewable/editable at all |
| **Session-derived counters** | Inflated: `/api/sessions` 60-row window (`backend/main.py:162`), Home "Last session" (`Home.jsx:77`), rotation (`workoutPlan.js:319-325`) — all safe **only** if `created_at` is backdated (`backend/main.py:69`) | Untouched |
| **Number of "best" definitions to keep in sync** | 4 (unchanged: `session_prs`, `Workout.jsx` map, `Progress.jsx` badge, `sessionStats`) — all fed from one join | 5, and they no longer share a source (§6.3) |
| **Idempotency** | No natural key; a UNIQUE on `sets` would also constrain legitimate real workouts | UNIQUE on `(exercise_id, weight_kg, reps, achieved_on)` is natural and cheap |
| **Units** | Same for both: convert to kg before `INSERT`; `le=1000` (`backend/main.py:105`) cannot detect a lb payload; rounding policy needed (§7) | Same, plus a second `weight_kg` column to keep consistent with the first |
| **Reversibility** | High — deleting the synthetic sessions restores the prior state exactly | High for data, lower for schema — the table and envelope shape persist |

---

## 10. Open questions this research did not settle (for brainstorming)

1. Does a PB carry `reps`? Two of the three metric comparisons need it
   (`backend/main.py:360`, `:364`), and "1RM 140" is not the same input as "140 × 3" (§7.3).
2. Should an imported PB suppress the `baseline` marker, or should baseline mean "first time
   *in the app*" regardless? The 2026-06-30 principle
   (`…2026-06-30-responsive-audit-pr-baseline-design.md:33`) does not anticipate a prior value
   that isn't a session.
3. Do PBs appear in `/api/export`? Under (a) they do automatically; under (b) it is a choice with
   the backward-compatibility consequence in §6.2.
4. Is there a third shape worth costing — a `sessions.source` / `is_imported` column? It gives
   (a)'s zero-fork PR logic while letting History, the session counters, and the recovery query
   filter synthetic rows out. It costs the migration that (a) was chosen to avoid, so it is a
   genuine middle option rather than a strict improvement.
