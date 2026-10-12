# Workout entities audit (#165)

Date: 2026-10-11, against `main` at `84febde`. A read-only audit: it proposes, it changes nothing.
Every claim cites `file:line` on that commit. `frontend/src/data/` could not be read by the tool
that wrote this, so nothing here describes `workoutPlan.js` or `plan_seed.py` internals beyond
what other files show.

## 1. The entities today

Schema is **v8** (`PRAGMA user_version`, `backend/main.py:311`). `AGENTS.md` and `STATE.md` still
say v7; v8 changed no table, only which version an envelope must carry (`main.py:304-311`).

| Entity | Table | Key facts |
|---|---|---|
| Plan day | `plan_days` | per profile, `UNIQUE(profile_id, day_key)` (`main.py:260-271`); seeded from `plan_seed.DEFAULT_PLAN` by `_seed_plan_for_profile` (`main.py:94`) |
| Plan exercise | `plan_exercises` | `sets`, `reps_low`, `reps_high`, `bodyweight`, muscles and cues as JSON text, `UNIQUE(plan_day_id, exercise_id)` (`main.py:274-293`) |
| Session | `sessions` | `date`, `workout_day` (a text key, no foreign key to `plan_days`), `completed`, `profile_id` (`main.py:316-322`) |
| Set | `sets` | `session_id`, `exercise_id`, `exercise_name`, `set_number`, `reps`, `weight_kg` (`main.py:323-332`); `SetIn` adds nothing else (`main.py:354-359`) |
| Personal best | `personal_bests` | `achieved_year` only, no date; `UNIQUE(exercise_id, weight_kg, reps, achieved_year)` (`main.py:144-155`, `395-401`) |
| Note | `exercise_notes` | per profile and exercise |
| Event | `events` | analytics |

Links are by convention, not by constraint: a session names its day by `workout_day` text,
validated only at insert time against the profile's `plan_days` (`main.py:1022-1026`); a set names
its exercise by `exercise_id` text with no link to `plan_exercises`. The model is deliberately
loose, which is what makes an extra or off-plan entry cheap to add and a rename of a plan key
silently orphan history.

Rules that constrain new work:
- One open session per profile: `create_session` returns 409 while any session has `completed = 0`
  (`main.py:1027-1030`).
- `create_session` rejects any `workout_day` not in the profile's `plan_days` (`main.py:1022-1026`).
  `_import_merge` applies the same check (`main.py:1685-1692`).
- Backup and restore copy a fixed table list (`TABLES`, `main.py:13-14`), and `_import_merge` validates
  each row against the same Pydantic models as the endpoints (`main.py:1636-1645`). A new column
  on `sets` or `sessions` has to be added to the model, the export and both import paths.

## 2. Every consumer of `sets`

All of these treat every set as a working set and sum or max across them with no filter:

- `GET /api/progress/{id}`: heaviest and best-single per session (`main.py:1162-1191`).
- `GET /api/progress`: `MAX(weight_kg)` per exercise, which seeds the workout page's PR baseline (`main.py:1193-1206`).
- `GET /api/exercises/recency`: set count and `SUM(weight*reps)` per exercise and session (`main.py:1344-1385`); this feeds the recovery estimate.
- `GET /api/sessions/{id}/prs`: weight, reps and volume PRs against all prior sets plus `personal_bests` (`main.py:1388-1425`).
- `GET /api/exercises/{id}/last`: reads the previous session's sets and feeds `suggest_progression` (`main.py:1316-1342`).
- The frontend recovery estimate consumes the recency endpoint and drops any exercise missing from the map it is given (`frontend/src/lib/recovery.js:84,91`).

## 3. Where each pending ask strains the model

**#170 warm-up sets.** Today a warm-up is only a suggestion line: `suggest_progression` returns 50% of
the working weight for `min(reps_high + 2, 15)` reps (`main.py:1299-1311`), shown in
`Workout.jsx:683-688`. Nothing about it is stored. To log one, a set needs a marker, and then every
consumer in section 2 must exclude it or it will corrupt PRs, progression and recovery:
a 50% warm-up logged as an ordinary set would become the "last sets" `suggest_progression` reads
and would add volume to recovery. The recovery research counts indirect sets as 0.5, so whether
a warm-up counts at all is a decision for #171, not an implementation detail.
Smallest shape: one nullable or defaulted column on `sets` (for example `kind`, default
`'working'`), filtered in the five endpoints above, added to `SetIn`, export and both import paths.
No new table.

**#167 goal-based volume and reps.** The "always defaults" worry is mostly stale:
`suggest_progression` only falls back to 20 kg and `reps_low` when there is no history
(`main.py:1249-1256`), and otherwise adjusts from the last sets. What is true is that sets and reps
are per-exercise seed data (`plan_exercises`, `main.py:274-293`) and no goal exists anywhere.
A goal fits on the profile (one value, no table), read when the plan is seeded or when a
suggestion is made. The open question is which, because seeding bakes the goal into plan rows
that later plan edits (#177, #222) will overwrite.

**#173 PB entry logs a workout.** `personal_bests` has a year and no date (`main.py:144-155`), so
the form cannot tell "today" from "this year", which the owner's rule depends on. Separately,
the extra session must be a session: it needs a `workout_day`, and `create_session` only accepts
a day in `plan_days` (`main.py:1022-1026`) and refuses to start while another session is open
(`main.py:1027-1030`). So an off-plan entry that must coexist with a planned session, as the
owner asked, cannot be a normal session today.

**#139 off-plan session by muscle area.** Same strain as #173, and one more: it logs muscle areas
rather than exercises, but every downstream consumer keys on `exercise_id`, and recovery silently
ignores any exercise that is not in the `exercisesById` map the caller passes in
(`recovery.js:84,91`). An extra set with an unknown `exercise_id` is stored, but contributes
nothing to recovery, and PR detection only matches it when the same `exercise_id` was used before.
Two shapes: (a) an off-plan session is a session with a reserved `workout_day` such as `extra`
that is allowed past the plan check and exempt from the one-open-session rule; (b) a separate
`extra_entries` table. (a) reuses the session list, history and export, but the workout page
shows "Couldn't find this workout." for any day not in the plan (`Workout.jsx:364-365`) and
`DAY_COLORS[session.workout_day]` (`Workout.jsx:366`) would be undefined, so it needs UI work;
History already falls back to the raw key (`History.jsx:168`). (b) keeps strength analytics clean
but needs its own history and export. The decision is for #173 and #139 together.

**#32 and #220-#223 AI export.** The plan is already a clean per-profile structure and
`GET /api/plan/export` is designed to carry plan, recent sessions and PBs. That export will
inherit any new column (warm-up kind, extra marker) and the AI will see it, so the markers need
stable, documented values before the export schema is written.

## 4. Recommendations, in order

1. **Decide the extra-session shape first** (#173 and #139 together): reserved `workout_day` with a
   relaxed check vs a separate table. It is the only choice that touches the one-open-session rule.
2. **Add the set marker once** for warm-ups, with a defaulted column, and filter it in the five
   endpoints in one change with tests per consumer. Do not add it until #171 says what a warm-up
   is, but design the filter list now so it is not rediscovered.
3. **Put the goal on the profile**, not the plan, unless #177 decides plan edits survive a goal change.
4. **Give PBs a date or a same-day flag** before #173 (owner question open on that Issue).
5. **Fix doc drift**: `AGENTS.md` and `STATE.md` say schema v7; it is v8.

## 5. Not covered
Frontend internals of `workoutPlan.js`, `plan_seed.py` and where `DAY_COLORS` is defined
(unreadable here); how `DayIcon` and `DayAccent` render a day key outside the seeded four;
performance at larger data sizes; any schema work. Nothing was run against a live database.
