# AI-mediated workout plan updates — design

**Date:** 2026-09-27
**Status:** New spec, direct owner ask (not yet an Issue — filed as one per phase below, per PLAYBOOK's
Feature intake flow: the ask is concrete enough to phase and size directly, matching the "owner Q&A
shaped it enough to split into ready children" path rather than the "needs a spec pass first, stays
intake" path).
**Related, not the same:** `2026-08-31-ai-structured-io-design.md` (#30/#32) designed the same
export→external-AI→paste-back→validate→confirm→write *shape* for two narrower cases: importing
outside training notes (#30), and a per-exercise numeric target nudge layered above the existing
static plan (#32 — "not a `workoutPlan.js` restructure," explicitly). **This spec is that
restructure.** It reuses #30/#32's envelope/confirm convention and its "never let unseen AI output
write to the database" rule, but the artifact it edits — the plan's actual exercise/day
structure — is new. #32's `exercise_targets` table (numeric per-exercise targets) and this spec's
`plan_exercises` table (structural exercise definitions: which exercises, which days, set/rep
prescriptions) are complementary, not overlapping — see §1.4.

---

## Problem

`frontend/src/data/workoutPlan.js` is a single hardcoded module: one plan, no owner, shared by every
profile, editable only by shipping a code change. The owner wants a lifter to be able to hand their
own situation to an AI tool of their choice, get back a proposed plan change, and apply it —
initially by copy-paste, eventually (explicitly named as the intended direction, not built yet) by
letting an agent update the plan directly through the same channel a human paste would use today.

That end state has a hard prerequisite the owner named explicitly: a plan has to be a *thing a
profile owns and can change*, not a JS import every profile shares. Nothing about AI mediation makes
sense before that's true.

## Scope — five phases

| Phase | What | This session |
|---|---|---|
| **1. Data model** | Per-profile, DB-backed plan; migrate the existing static plan in, losing nothing. | **Shipped** — see §2, PR(s) below. |
| **2. Export format** | What the app hands the user to paste into their AI tool. | Spec'd (§3), not built — depends on Phase 1's shape being live and stable first. |
| **3. The prompt** | Prompt-engineering deliverable, tested against real AI tools. | **Designed and tested live** (§4) — this is content, not code, and didn't need Phase 1's endpoint to exist to validate against real ChatGPT/Gemini sessions. |
| **4. Paste-back ingestion** | `POST /api/plan/update` — validated, bounded, reusable by a future agent, not just this UI. | Spec'd (§5), not built — real write-path work, deserves its own review cycle once 1-3 are settled. |
| **5. UI** | Export screen, paste-back screen. | Spec'd (§6), not built — depends on 2 and 4 existing. |

Phases 2, 4, 5 are filed as separate tracked Issues (see §7) with this spec as their shared design
doc, the same pattern #29 → #66/#67/#68/#69 and this project's own #30/#32 split already established.

---

## 1. Data model (Phase 1)

### 1.1 Schema — additive only, nothing dropped or renamed

```sql
-- v6 -> v7
CREATE TABLE plan_days (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id  INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    day_key     TEXT NOT NULL,       -- stable id, e.g. 'upper_a' — sessions.workout_day names this
    name        TEXT NOT NULL,       -- 'Upper A'
    tag         TEXT,                -- 'Chest · Back Horizontal · Arms'
    icon        TEXT,                -- display hint ('upper' | 'lower' | an emoji) — chrome, not content
    sort_order  INTEGER NOT NULL,    -- position in the day-rotation cycle
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(profile_id, day_key)
);
CREATE TABLE plan_exercises (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_day_id   INTEGER NOT NULL REFERENCES plan_days(id) ON DELETE CASCADE,
    exercise_id   TEXT NOT NULL,       -- stable slug, e.g. 'bench_press' — sets/personal_bests/
                                        -- exercise_notes already key on this as free text (no FK
                                        -- today), so removing/renaming here cannot orphan history
    name          TEXT NOT NULL,
    alt           TEXT,
    sets          INTEGER NOT NULL,
    reps_low      INTEGER NOT NULL,
    reps_high     INTEGER NOT NULL,
    bodyweight    INTEGER NOT NULL DEFAULT 0,
    muscles_json  TEXT NOT NULL DEFAULT '[]',   -- JSON array of strings — see 1.2 for why not a table
    yt_url        TEXT,
    cues_json     TEXT NOT NULL DEFAULT '[]',   -- JSON array of strings
    sort_order    INTEGER NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(plan_day_id, exercise_id)
);
CREATE INDEX idx_plan_exercises_day ON plan_exercises(plan_day_id);
```

Both tables join `TABLES`/`TABLE_INTRODUCED_AT` (the `/api/export`/`/api/import` disaster-recovery
envelope). Leaving them out made a whole-database restore delete every profile's plan while
`user_version` stayed pinned forward, which no later migration could repair — `create_session`
validates `workout_day` against the caller's own `plan_days`, so a profile without one cannot start
any workout. They are stamped **v8**, not the v7 that created them: that column says which version an
envelope must already carry, and every backup written before this was stamped 7 without plan rows.

### 1.2 Why JSON text columns for `muscles`/`cues`, not child tables

Both are short, ordered, display-only string lists — never filtered or joined on individually
anywhere in the app (`muscles.js` reads `exercise.muscles` as a whole array to bucket into
`MUSCLE_GROUPS`; cues render as a flat list in the form-cues sheet). A `plan_exercise_muscles`/
`plan_exercise_cues` join-table pair would be two more tables, two more migrations, and ordering
columns to boot, to save nothing this app ever does with the data. SQLite's `json_each`/`->>`
functions exist if a future need for querying inside these ever appears; none does today. This is
the same call this codebase already made in `AGENTS.md`'s own stated style (favor duplication/
simplicity over a speculative shared layer) applied to schema instead of code.

### 1.3 `backend/plan_seed.py` — one canonical seed, not two

`frontend/src/data/workoutPlan.js`'s content (4 days, 22 exercises, verbatim) becomes
`backend/plan_seed.py`'s `DEFAULT_PLAN` — a plain Python list-of-dicts transcription, used by:
- **The v7 migration's backfill**, once, for every profile that has zero `plan_days` rows at
  migration time (today: just the seeded `kapekost` profile) — so the existing profile's plan is
  identical in content, just relocated from a JS import to DB rows. Nothing is lost: the exact same
  22 exercises, cues, rep ranges, in the exact same 4 days, in the exact same order.
- **`create_profile`** (`backend/main.py:722`, admin-only), so a brand-new profile added later starts
  with the same real, immediately-usable starter plan, not an empty one — and can then customize it
  (this session, by hand; later, by pasting an AI update).

`frontend/src/data/workoutPlan.js` **is not deleted**. It keeps exporting `PLAN`/`CYCLE`/
`getNextWorkoutId`/`DAY_COLORS` exactly as today, for two reasons: (a) it's the literal source
`plan_seed.py` was transcribed from — keeping it makes that transcription checkable by diff rather
than trusted from memory; (b) the frontend test suite uses it as canned fixture data to mock the new
`usePlan()` hook (§1.5) rather than re-authoring 22 exercises' worth of literal test fixtures. It
stops being imported by any **runtime** app page — that seam is the actual point of this phase. A
follow-up chore to delete it once nothing points at it live is a fine future cleanup, not needed now
(noted in §8, not filed as its own Issue — too small to be worth one).

`DAY_COLORS` (the categorical accent-per-day palette) stays exactly where it is, keyed by `day_key`
strings, untouched by this migration — it's presentation chrome, not plan content, and the app
already has a documented neutral fallback for any `day_key` its static map doesn't recognize (see
`workoutPlan.js`'s own comment on the fallback), which is exactly what a future custom/AI-added day
would hit. Good enough; not solved further here.

### 1.4 Relationship to #32's `exercise_targets` (unbuilt)

`exercise_targets` (per-exercise numeric weight/rep target, proposed by #32's coaching-export loop)
and `plan_exercises` (structural: which exercises exist, which day, prescribed set/rep range) answer
different questions and can coexist: `plan_exercises` says "Bench Press, 3 sets of 6-10, on Upper A";
`exercise_targets`, if it ships, would say "and today aim for 85kg." Feature 1 (dynamic progression,
shipped separately this session) computes its own live weight suggestion from actual last-session
performance and doesn't read either table — a future revision could blend in an `exercise_targets`
value as one more input, but that's speculative and not designed here (Feature 1's own spec, §6,
already says this).

### 1.5 Backend surface (Phase 1)

- `GET /api/plan` → the acting profile's plan, shaped to match `workoutPlan.js`'s existing `PLAN`
  object almost exactly (a deliberate compatibility shape, so the frontend hook in §1.6 is a thin
  reshape, not a rewrite of every consumer's own logic):
  ```json
  {
    "plan": { "upper_a": {"id": "upper_a", "name": "Upper A", "tag": "...", "icon": "upper",
                            "exercises": [ {"id": "bench_press", "name": "...", "alt": "...",
                                            "sets": 3, "repsLow": 6, "repsHigh": 10,
                                            "bodyweight": false, "muscles": [...], "ytUrl": "...",
                                            "cues": [...]}, ... ] }, ... },
    "cycle": ["upper_a", "lower_a", "upper_b", "lower_b"]
  }
  ```
  (`repsLow`/`repsHigh`/`ytUrl` camelCase on the wire, matching the existing JS object's own field
  names exactly — `sets`/`bodyweight`/`muscles`/`cues` already match as-is. `icon` carries whatever
  `plan_days.icon` stores, which for the migrated seed profile is the same value `workoutPlan.js` has
  today per day.)
- **`SessionIn.workout_day` changes from a hardcoded `Literal["upper_a","lower_a","upper_b",
  "lower_b"]` to `str`, validated in `create_session` against the acting profile's own
  `plan_days.day_key` set (400, not a Pydantic 422, on an unknown key).** This is the one other real
  coupling point to the old static plan (`main.py`'s own comment on `SessionIn` said so explicitly:
  "adding or renaming a day... requires updating this Literal in the same deploy, or Start Workout
  422s") — leaving it as a hardcoded enum while the plan itself becomes per-profile data would silently
  cap every profile at the same 4 day keys forever, defeating the point of this phase.
- No write endpoint yet. Phase 1 is read-only from the app's perspective (a plan that already has
  the exact content it had yesterday, just relocated) — `POST /api/plan/update` is Phase 4's job,
  spec'd in §5, not built until then. Nothing in this phase lets a lifter (or an AI) actually change
  anything about their plan; it only stops being a shared file.

### 1.6 Frontend surface (Phase 1)

`frontend/src/lib/planContext.jsx` — a `PlanProvider`/`usePlan()` pair, matching the existing
`SessionProvider`/`useSession()` pattern in `frontend/src/lib/session.jsx` exactly (same shape: a
context with a safe default so a component rendered without the provider — tests — doesn't throw;
fetch-once-on-mount; a `ready` flag Shell can gate on the same way it already gates on
`useSession()`'s `ready`). Nested in `App.jsx` alongside `ActiveSessionProvider`, fetching once a
`profile` exists.

The 12 files that import `PLAN`/`CYCLE`/`DAY_COLORS`/`getNextWorkoutId` from
`../data/workoutPlan` today (`DayIcon.jsx`, `ResumeBanner.jsx`, `MuscleGroupPicker.jsx`,
`DayAccent.jsx`, `muscles.js`, `History.jsx`, `Exercise.jsx`, `PersonalBests.jsx`, `Home.jsx`,
`Workout.jsx`, plus their `*.test.*` files) switch their `PLAN`/`CYCLE` source from the static import
to `usePlan()` — a one-line seam change per file since every one of them already treats `PLAN`/
`CYCLE` as plain data keyed exactly the way `usePlan()` now provides it. `DAY_COLORS` (chrome, not
data — §1.3) keeps being imported from `workoutPlan.js` directly everywhere; it never moves.
`muscles.js` (a plain module, not a component, that builds `ALL_EXERCISES`/`EXERCISE_BY_ID` at
import time from a module-level `PLAN` constant) changes shape slightly: its exports become
functions of a `plan` argument (`allExercises(plan)`, `exerciseById(plan)`) rather than
import-time constants, since it can no longer assume a static `PLAN` exists at module load.

Given the real size of this cutover (12 consumer files + their tests, on top of the schema/endpoint
half), it is planned and executed as **two linked sub-tasks** rather than one large diff, per this
project's own task-sizing discipline (GUARDRAILS "effort:L must be split"):
- **1a — Backend data model**: schema, migration, `plan_seed.py`, `GET /api/plan`, the
  `workout_day` validation change, backend tests. Self-contained; ships without touching the
  frontend at all (the frontend keeps importing the static module unchanged in the interim — nothing
  regresses if 1a ships alone).
- **1b — Frontend cutover**: `PlanProvider`/`usePlan()`, the 12-file swap, test updates. Depends on
  1a's `GET /api/plan` existing.

### 1.7 Destructive-operations check (GUARDRAILS)

Checked explicitly, per the task's own instruction to check this carefully:
- Not a drop or rename of any table/column — `plan_days`/`plan_exercises` are new tables; every
  existing table is untouched.
- Not a migration with data loss — the backfill only **inserts** rows (from `plan_seed.py`'s literal
  content) for profiles that have none yet; it reads nothing from and deletes nothing in any existing
  table. `sets`/`personal_bests`/`exercise_notes` keep referencing exercise ids as free text, exactly
  as they do today (§1.1) — no FK is added that could later reject or cascade-delete historical rows.
- Not >10 files deleted (nothing is deleted; `workoutPlan.js` stays, per §1.3).
- Not auth/session/secret/token handling.
- Not a history rewrite, force-push, or remote branch deletion.

**Conclusion: not destructive under GUARDRAILS' definition.** No `approved` label or standing
approval is required before shipping 1a/1b. This conclusion is stated explicitly, with its reasoning
shown above, rather than asserted, exactly as GUARDRAILS asks for anything schema-adjacent — if the
owner reads this differently, that's a fast correction, not a redesign.

### 1.8 Testing (Phase 1)

Backend: migration backfill seeds the exact `plan_seed.py` content for a profile with zero
`plan_days` rows and is a no-op for one that already has rows (idempotent, matching every other
`_migrate` block's `if v < N` guard style); `GET /api/plan` shape matches `workoutPlan.js`'s existing
object field-for-field for the seeded profile; `create_session` accepts any `day_key` present in the
acting profile's `plan_days` and 400s on one that isn't, replacing (not just supplementing) the old
Literal-based 422 test; `create_profile` seeds a full starter plan for the new profile.

Frontend: `usePlan()` unit tests (loading → ready, matching `session.jsx`'s own test shape if one
exists); each of the 12 consumers' existing test suites keep passing by mocking `usePlan()` to return
`workoutPlan.js`'s literal `PLAN`/`CYCLE` as canned data (§1.3) rather than rewriting fixtures.

No UI-expert/UX-expert review gate for 1a/1b specifically — nothing new renders; the plan looks
identical to a logged-in user before and after. A manual render/smoke check (Home, Workout, History,
Exercise, PersonalBests) stands in, per PLAYBOOK's "look at it rendered" baseline gate, to catch a
silent regression a green test suite wouldn't (e.g., a hook returning stale data on profile switch).

---

## 2. (kept short — implementation detail lives in the linked plan document, not duplicated here)

Phase 1's task-by-task implementation plan is
`docs/superpowers/plans/2026-09-27-plan-data-model.md`.

---

## 3. Export format (Phase 2 — spec'd, not built)

`GET /api/plan/export?sessions=20` (acting profile, `sessions` caps how many recent **completed**
sessions are included — default 20, matching this codebase's own existing "recent, not all-time"
convention, e.g. `get_progress`'s `LIMIT 60`, chosen smaller here since a plan-update conversation
needs *recent trend*, not a full training log, and compactness is an explicit requirement):

```json
{
  "schema": "workout-tracker/plan-context-export/v1",
  "generated_at": "2026-09-27T10:00:00Z",
  "plan": { "...": "exactly Phase 1's GET /api/plan shape" },
  "recent_sessions": [
    {"date": "2026-09-20", "workout_day": "upper_a",
     "sets": [{"exercise_id": "bench_press", "exercise_name": "Bench Press", "set_number": 1,
               "reps": 8, "weight_kg": 80.0}, "..."]}
  ],
  "personal_bests": [{"exercise_id": "bench_press", "weight_kg": 85.0, "reps": 5, "achieved_year": 2026}],
  "notes": {"bench_press": "left shoulder twinges past 85kg, watch the tuck"},
  "constraints": {"weight_unit": "kg", "no_recovery_percentages_or_readiness_scores": true}
}
```

`constraints` carries forward the same structural rule #32's spec established (§4.2 of the
ai-structured-io-design doc): the recovery-science "no percentages, no readiness score" rule is
restated here in the exported data itself (not just the prompt) for the same reason it was there —
the app can't control what a human pastes into an external AI conversation, so the constraint needs
to survive being read out of context, not just obeyed by a cooperative prompt.

Response also carries the current prompt template text (§4) inline, `"prompt_template": "..."`, so
the export and the instructions for using it travel together as one copy-able unit — matching #32's
own `GET /api/coaching/export` precedent (§4.1 of that spec) rather than inventing a different
shape for a near-identical need.

**Why this waits on Phase 1 being live:** exporting `workoutPlan.js`'s static content today would
produce an export that's identical for every profile and can't reflect any prior AI-applied change —
exporting the DB-backed plan is the entire point.

## 4. The prompt (Phase 3 — designed and live-tested this session)

### 4.1 Design goals

Must (a) reliably produce **only** JSON matching Phase 5's `plan-update/v1` schema, with no
surrounding prose or code fences to strip; (b) refuse to reference an `exercise_id` that isn't in the
plan it was given, for `modify`/`remove`; (c) keep numeric outputs inside sane bounds on its own,
as a first line of defense before the endpoint's own bounds-check (§5.3) — belt and suspenders, not
either/or; (d) hold the "no recovery percentages/readiness scores" structural rule; (e) work
"regardless of which AI tool the user pastes it into" (the task's own requirement) — tested against
two, not designed for one and hoped for the other.

### 4.2 Prompt text (v1, as tested)

```
You are a strength-training coach helping update a lifter's workout plan inside an app called
Workout Tracker. You will be given a JSON export of their current plan, recent training history,
and personal bests below, plus (optionally) their own note about what they want changed.

Your job: propose specific, structured changes to their CURRENT PLAN'S STRUCTURE ONLY — which
exercises appear on which day, how many sets, and their target rep range. You cannot log workouts,
set a specific target weight for today, rename the app, or add a new training day — only modify,
add, or remove exercises within the days already present in the plan you were given.

Output ONLY a single JSON object. No prose before or after it. No markdown code fences. It must be
parseable by a strict JSON parser on the first try, exactly matching this shape:

{
  "schema": "workout-tracker/plan-update/v1",
  "summary": "<one short paragraph, plain language: what you changed and why>",
  "day_updates": [
    {
      "day_key": "<a day_key value copied exactly from the plan you were given>",
      "exercise_updates": [
        {"op": "modify", "exercise_id": "<id already in that day>", "sets": <int, optional>,
         "reps_low": <int, optional>, "reps_high": <int, optional>},
        {"op": "add", "exercise_id": "<new_lowercase_snake_case_id>", "name": "<Display Name>",
         "alt": "<short equipment/variation note>", "sets": <int>, "reps_low": <int>,
         "reps_high": <int>, "bodyweight": <true or false>, "muscles": ["<1-4 short tags>"],
         "cues": ["<3-5 short, imperative form cues, matching the terse style of the cues already in
                   the plan you were given>"]},
        {"op": "remove", "exercise_id": "<id already in that day>"}
      ]
    }
  ]
}

Hard rules:
- sets: 1-10. reps_low and reps_high: 1-50, and reps_high must be >= reps_low. Never output a value
  outside these ranges.
- "modify" and "remove" may only name an exercise_id that already exists, in the day you named, in
  the plan you were given. Never invent one for those two operations.
- "add" must use a new exercise_id, not already present anywhere in the plan.
- Do not express anything as a recovery percentage, a "readiness" score, or any other numeric
  confidence/fatigue score. Plain language only.
- Do not invent training history, personal bests, or notes that were not in the data you were given.
- If you don't have a specific, evidence-based reason to change a day, leave that day out of
  day_updates entirely rather than making a change to justify including it.
- Output nothing but the JSON object. It will be parsed by a program, not read by a person first —
  any extra text, even a one-line intro, will make it fail to import.

Here is the export:
<PASTE THE EXPORTED JSON HERE>

Here is what I want changed (leave this section out entirely if you just want general programming
judgement based on the history above):
<YOUR OWN NOTE, OR DELETE THIS LINE>
```

### 4.3 Live testing — method and findings

Tested via `claude-in-chrome` against real, logged-in **ChatGPT** (chatgpt.com, default model) and
**Gemini** (gemini.google.com, "Flash" model — the signed-in account's own default, left as-is
rather than switched to a stronger tier, since that's what a real user would hit) web sessions — the
task's own explicit ask to "actually test it," not reason about it in the abstract. Built one
realistic sample export by hand (no real endpoint to call yet — Phase 2 isn't built): a compact,
2-day-only plan slice (Upper A: Bench Press, Incline DB Press; Lower B: Deadlift, Back Squat, chosen
small deliberately for a fast, readable test rather than pasting the full 4-day/22-exercise plan),
three recent sessions (a clean Back Squat session 8 weeks back at 95kg×8, a missed-rep Back Squat
session 23 days before "today" at 100kg×4-5 — reps falling below the plan's `reps_low: 6` — and a
clean Bench Press session 7 days before "today", all 3×10 at 80kg), personal bests, and an
`exercise_notes` entry flagging shoulder discomfort on heavy bench. The exact prompt text from §4.2
and this exact export were pasted into both tools, unmodified, in the same session.

**Both tools produced strictly valid JSON, unfenced, matching the schema exactly, on the first real
attempt — no iteration on the prompt wording was actually needed for either tool.** Both outputs
were saved and round-tripped through `json.loads` to confirm parseability (not just eyeballed):

- **ChatGPT** — `{"schema":"workout-tracker/plan-update/v1","summary":"Adjusted Lower B to use a
  lower rep range for back squats after the recent drop from 8 reps at 95 kg to 4–5 reps at 100 kg,
  while keeping the existing set count. Added a chest-supported row to Upper A to provide the
  horizontal back work indicated by that day's structure without increasing pressing volume.", ...}`
  — one `modify` on `back_squat` (`reps_low: 4, reps_high: 6`, correctly reading the missed-rep
  session as the reason to lower the target rather than raise it) and one `add`
  (`chest_supported_row`, full valid schema: name/alt/sets/reps/bodyweight/muscles/cues all present
  and sane). `exercise_id` values copied verbatim from the export in both ops. Left Lower A and
  Upper B alone — they weren't in the trimmed export at all, so there was nothing to pad.
- **Gemini** — `{"schema":"workout-tracker/plan-update/v1","summary":"Shifted Bench Press on Upper A
  to an 8-12 rep range to accumulate volume without pushing into heavier weights that trigger
  shoulder twinges, and added Bent-Over Row to balance the pressing load and match the day's
  horizontal back tag. Adjusted Back Squat on Lower B to a 4-8 rep range...", ...}` — a `modify` on
  `bench_press` (widened the rep range upward instead of adding weight, explicitly citing the
  shoulder-twinge note — a direct, correct use of the `exercise_notes` data), an `add`
  (`bent_over_row`, same shape completeness as ChatGPT's addition), and a `modify` on `back_squat`
  (`reps_low: 4, reps_high: 8` — same direction as ChatGPT's call, a slightly different endpoint).

**A real, useful finding, not a failure:** both tools independently added a new pulling exercise to
Upper A (`chest_supported_row` / `bent_over_row`) — because the trimmed 2-exercise export genuinely
gave Upper A no horizontal-pull movement at all, and both models noticed that gap on their own and
filled it with a schema-valid, reasonably-cued suggestion. That's the export being artificially
sparse for this test (a real `GET /api/plan/export` would include the full day, which already has
`bent_row`), not a prompt defect — but it's also a real, mildly reassuring signal: both tools reached
for the *correct kind* of fix (a horizontal-pull addition, matching the day's own `tag` field —
neither invented something unrelated like a second bicep exercise) when they thought one was needed.

Neither tool expressed anything as a recovery percentage or a readiness score in its `summary`.
Neither invented history, personal bests, or notes beyond what was in the export. Both correctly
used `modify` (not `add`) for `back_squat`/`bench_press`, since those ids already existed. All
`sets`/`reps_low`/`reps_high` values in both responses sit well inside the bounds Phase 4 will
enforce (§5.1) — no near-boundary or out-of-range case surfaced in this pass.

**What this validates, and what it doesn't:** this is one real, honest test per tool, not a
multi-round tuning process — the prompt in §4.2 (already written with explicit anti-ambiguity rules:
copy ids verbatim, no code fences, no padding without evidence) worked cleanly against both tools on
the first try, which is a genuinely good sign for "regardless of which AI tool," but it is **one
scenario, tested once each**, not exhaustive coverage. Untested: an adversarial or malformed paste, a
deliberately conflicting user note, a much larger real export (the full 22-exercise plan plus 20
sessions), and any AI tool response that ignores the "no code fence" instruction the way earlier,
less carefully-worded prompt drafts in unrelated projects sometimes do — none of that failure mode
happened to appear in this test, but a clean pass twice is evidence the prompt is well-designed, not
proof it always will be. **This is exactly why Phase 4's endpoint still bounds-checks and rejects
independently (§5.3) rather than trusting the prompt to have fully worked** — matching the task's own
"never trust pasted external content as safe by default" instruction, live-test success included.

*(A mechanical note on how this test was actually run, for whoever repeats it: driving these tools by
simulated keystrokes rather than a real clipboard paste means literal `\n` characters in a typed
string can trigger a premature Enter-to-send in a chat textbox mid-message. The fix used here was
typing the whole prompt+export as continuous prose with no embedded newlines — semantically identical
to §4.2's formatted version, since neither model needs literal line breaks to parse instructions
correctly, but worth knowing if this test is re-run through browser automation again rather than a
real human copy-paste, which doesn't have this problem.)*

## 5. Paste-back ingestion (Phase 4 — spec'd, not built)

### 5.1 Endpoint, designed as a real internal capability first

**`POST /api/plan/update`** — not a UI-only handler. Takes the same envelope/confirm shape as
`/api/import` and the (unbuilt) `/api/coaching/apply-update`:

```python
class PlanExerciseOp(BaseModel):
    op: Literal["modify", "add", "remove"]
    exercise_id: str = Field(pattern=r"^[a-z][a-z0-9_]{0,63}$")
    name: Optional[str] = Field(default=None, max_length=128)
    alt: Optional[str] = Field(default=None, max_length=128)
    sets: Optional[int] = Field(default=None, ge=1, le=10)
    reps_low: Optional[int] = Field(default=None, ge=1, le=50)
    reps_high: Optional[int] = Field(default=None, ge=1, le=50)
    bodyweight: Optional[bool] = None
    muscles: Optional[list[str]] = Field(default=None, max_length=10)
    yt_url: Optional[str] = Field(default=None, max_length=512)
    cues: Optional[list[str]] = Field(default=None, max_length=8)

class PlanDayUpdate(BaseModel):
    day_key: str = Field(max_length=64)
    exercise_updates: list[PlanExerciseOp] = Field(max_length=20)

class PlanUpdateIn(BaseModel):
    envelope: dict   # {"schema": "workout-tracker/plan-update/v1", "summary": str,
                      #  "day_updates": [...]}, max 10 day_updates
    confirm: bool = False
```

**Why an endpoint, not UI-embedded logic (the forward-looking requirement):** the owner named
connecting an agent directly to the profile, without the copy-paste round trip, as the explicit next
step after this. If the validation/apply logic lived inside a React paste-back screen's event
handler, that work would need a full rewrite to become callable by anything else. Built as a real
endpoint instead, the *only* thing that changes for the future agent-direct path is **who calls
this** — a script or a live agent session posting the same envelope shape this UI posts today,
presumably behind its own auth (a future API-token or agent-credential scheme, not designed here,
since it isn't being built yet) — the validation, the bounds-checking, and the confirm-before-write
guarantee are already the real thing, not a prototype standing in for one.

### 5.2 Semantics per op, scoped to the acting profile

- `modify` — `exercise_id` must already exist in the named `day_key`'s exercises for this profile
  (400, naming the missing id, if not). Only the fields present in the payload change; omitted
  fields keep their current value (a partial update, like `SessionPatch`'s existing pattern).
- `add` — `exercise_id` must **not** already exist anywhere in this profile's plan (400 if it does —
  "use modify instead" in the error message, matching this repo's existing precedent of specific,
  actionable 400 text over a generic "invalid" message). All of `name`/`sets`/`reps_low`/`reps_high`
  are required for this op (empty/omitted → 400 naming the missing field) — `alt`/`bodyweight`/
  `muscles`/`yt_url`/`cues` may be omitted and default sensibly (`bodyweight: false`, empty lists).
- `remove` — `exercise_id` must exist in the named day (400 if not). **Never touches
  `sets`/`personal_bests`/`exercise_notes`** — those key on `exercise_id` as free text with no FK to
  `plan_exercises` (§1.1), so a removed exercise's history stays exactly where it was, just no longer
  offered for new sessions. Stated explicitly in the endpoint's own docstring, since it's the one
  thing a lifter would reasonably worry a plan edit could do and structurally cannot.
- Creating or deleting a whole **day** is explicitly **out of scope for v1** — every `day_key` in the
  payload must already exist in the profile's `plan_days`, or the whole payload is rejected (400).
  Reason: a new day interacts with `SessionIn`'s validation (§1.5), the day-rotation `cycle` order,
  and `DAY_COLORS`' fallback all at once — a real increment, not a one-line addition, and not
  something the owner's ask specifically required ("update my plan," not "restructure my split").
  The schema and endpoint shape don't preclude adding an `"op": "add_day"` / `"remove_day"` later —
  noted here so a future session doesn't have to rediscover this was a deliberate cut, not an
  oversight.

### 5.3 Bounds-checking — why `sets`/`reps`, not "weight"

The task's own framing used "an absurd weight" as the illustrative example of what bounds-checking
guards against. `plan_exercises` has no weight field at all (§1.4 — a plan is a *prescription*, not a
*today's number*; that's Feature 1's and #32's territory, not this one's), so there is no weight
value this endpoint could corrupt. The equivalent real risk here is `sets`/`reps_low`/`reps_high` —
an AI (or a hand-edited paste) proposing `"sets": 400` or `"reps_high": 5000` — and those are the
fields actually bounded (§5.1: `sets` 1-10, reps 1-50, `reps_high >= reps_low` checked as a
cross-field rule at validation time, not just per-field). String fields are length-capped
(`name`/`alt` ≤128, each cue ≤160, each muscle tag ≤32) and `exercise_id`/day `day_key` are
pattern-constrained to a safe slug shape — not a security boundary (parameterized SQL already
prevents injection) but a data-quality one, matching the task's "reject cleanly... rather than
best-effort-parsing" instruction: a `day_key` containing garbage is a clear, named 400, not a
silently-truncated row.

### 5.4 Preview vs. confirm, same transaction discipline as `/api/import`

`confirm: false` (default): validate the whole payload (all-or-nothing — one bad op 400s the entire
request, naming which op and why, never a partial apply), then return a **preview**, zero writes:
```json
{"days_affected": 2, "exercises_added": 1, "exercises_modified": 2, "exercises_removed": 1,
 "details": ["Lower B: Romanian Deadlift 3→4 sets", "Lower B: added Goblet Squat (3×10-15)",
             "Lower B: removed Seated Calf Raise"],
 "ai_summary": "<the envelope's own summary text, shown for context, not persisted verbatim anywhere
                beyond this preview>"}
```
`confirm: true`: re-validates (never trust a stale preview — the plan may have changed between the
preview call and confirm), then applies inside `BEGIN`/`commit`, rolling back whole on any failure —
identical discipline to `/api/import` (`backend/main.py:1157-1188`) and the pattern the #32 spec
already established for this exact class of endpoint.

### 5.5 Testing (Phase 4, when built)

Schema validation rejects each malformed case with a specific, named-field message (out-of-range
`sets`, `reps_high < reps_low`, unknown `day_key`, `modify`/`remove` naming an id that doesn't exist,
`add` naming one that already does, an oversized payload past the 10-day/20-exercise caps);
`confirm: false` writes nothing and returns an accurate preview; `confirm: true` writes exactly what
the preview promised and is transactional (a mid-payload failure leaves the plan completely
unchanged, tested by forcing a failure on the second of two day_updates); `remove` leaves
`sets`/`personal_bests`/`exercise_notes` rows for that `exercise_id` completely untouched (a direct
regression test for §5.2's own guarantee).

## 6. UI (Phase 5 — spec'd, not built)

Two screens, reusing existing tokens/components only (`DisclosureRow`, `Eyebrow`, the app's existing
card/button styles) — no new design system, matching the standing efficiency bar:

- **Export screen** (`/plan/export` or a section of an existing settings-shaped page — exact
  placement is a plan-time call): shows the prompt + export as one copy-able block (a single "Copy
  prompt + your data" button, matching #32's own §5 "shared review-screen shape" precedent of one
  recognizable interaction across both AI-mediated flows in this app), plus brief instructions
  ("paste this into ChatGPT, Claude, or Gemini, then bring the reply back here").
- **Paste-back screen**: a textarea for the AI's raw reply, a "Preview" action calling
  `POST /api/plan/update` with `confirm: false`, rendering §5.4's preview shape as plain counts + a
  short list (not a raw JSON dump — matching #32 spec §5's own stated convention), a visible
  "Confirm" button that only enables after a successful preview, and a specific inline error (which
  field, which op) on a failed validation rather than a generic "couldn't read that."

---

## 7. Sequencing / Issues

- **Phase 1 (this session):** shipped as 1a + 1b, tracked issue(s) filed via `scripts/create_issue.sh
  ready` alongside the PR(s) — see the session report for numbers.
- **Phase 2 (export):** filed as its own `ready` Issue, `blocked-by` Phase 1, this spec as its design
  doc, §3 as its scope.
- **Phase 3 (prompt):** the prompt text (§4.2) and live-test findings (§4.3) are the deliverable —
  filed as a `ready` Issue whose "work" is landing the finished §4.2 text as the served
  `prompt_template` string once Phase 2's endpoint exists to serve it from (nothing to build before
  then; this Issue exists so the design doesn't get lost, not because there's separate code to write).
- **Phase 4 (ingestion):** filed as its own `ready` Issue, `blocked-by` Phase 2 (needs the export
  schema finalized) and Phase 1, §5 as its scope — the biggest remaining chunk of real engineering.
- **Phase 5 (UI):** filed as its own `ready` Issue, `blocked-by` Phase 4, §6 as its scope.

## 8. Deferred, not designed here

- Whole-day add/remove via the AI ingestion path (§5.2) — schema/endpoint shape allows it later.
- Blending a live agent-direct connection's auth/credential model into `/api/plan/update` — the
  owner named this as the future direction; §5.1 designs the endpoint so that connecting it later is
  "add a caller," not "rebuild the validation," but the credential scheme itself is unscoped and
  unbuilt, correctly, since nothing about it was asked for yet.
- Formal adversarial/red-team testing of the prompt (deliberately ambiguous or contradictory notes,
  an intentionally malformed export) — §4.3's testing was real but not exhaustive; Phase 4's endpoint
  validation is the actual safety boundary regardless, per §5.3's closing point.
