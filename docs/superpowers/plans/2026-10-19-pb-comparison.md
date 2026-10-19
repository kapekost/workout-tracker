# Plan: Personal best comparison (#389)

Spec: `docs/superpowers/specs/2026-10-18-pb-comparison-design.md`. Owner decisions (2026-10-19, `DECISIONS.md`):
opt-in per profile, anonymous. This plan orders the work and settles what the spec left open. It is not code.

## Scope

In: a per-profile opt-in flag (schema v10), a toggle on the Personal Bests page, one read endpoint returning
aggregates only, one muted line under each of the caller's bests.

Out (unchanged from the spec): names, rank numbers, history, per-set detail, notifications, any export of other
members' data, any claim about what the numbers mean for the user's training.

## Decisions the spec left open

1. **Wording of "anonymous ranks".** `DECISIONS.md` says anonymous ranks, the spec says no ranks. Resolved to
   the spec: values in descending order, no "#1". Order carries the rank; nothing labels it. Reopen only if the
   owner wants labels.
2. **One request, not one per exercise.** The spec sketches `?exercise_id=`. The page already knows its
   exercises, so the endpoint takes none and answers for the caller's own exercises in one call:
   `GET /api/personal-bests/top` returns `{"sharing": bool, "top": {"<exercise_id>": [kg, kg, kg]}}`.
   An exercise with fewer than 3 other opted-in members is absent from `top`, not an empty list.
3. **The flag rides on this response.** `sharing` is returned here and set by `PUT /api/personal-bests/sharing`
   (`{"sharing": bool}`, returns the same shape). No change to `auth_me`, `session_profile` or the session
   context, so no other screen learns about the flag.
4. **Whose numbers feed the line.** For each opted-in other member, their best est. 1RM per exercise is the
   maximum of `epley()` over their `personal_bests` rows and their sets in completed sessions, the same two
   sources `session_prs` already merges. Reuse `epley()`; do not add a second formula. The caller's own line
   is still their `personal_bests` row (`single_kg`), which the page shows today. A caller who logs heavier
   sets than their entered best is compared by the entered value; accepted, the page has always worked this way.
5. **The threshold counts members, not values.** At least `MIN_COMPARISON_MEMBERS = 3` other opted-in members
   must have a best for that exercise. Three values from one member never qualify. A module constant, not a
   setting.
6. **Opting out takes effect at once.** The query joins `profiles.share_bests` at read time. Nothing is copied,
   so there is no cache to clear and no stale entry to purge.
7. **The caller is excluded and need not be opted in.** A non-sharing member still sees the line. Reciprocity
   (only sharers see it) is a different feature and is not built.
8. **Default is off for every existing profile.** The column is `INTEGER NOT NULL DEFAULT 0`, so nothing is
   exposed by the migration, including for restored older envelopes.

## Tasks, in order

Each task is its own commit on one branch; red test first, then the change.

### 1. Schema v10 and restore

Files: `backend/main.py` (`_migrate`, `SCHEMA_VERSION`), `backend/test_foundations.py` or the file that asserts
the version.

- `v < 10`: `ALTER TABLE profiles ADD COLUMN share_bests INTEGER NOT NULL DEFAULT 0` guarded by
  `_column_exists`, then `PRAGMA user_version = 10`. Bump `SCHEMA_VERSION`.
- Restore needs no code: `_import_replace` copies envelope columns that exist in the live table, so an older
  envelope leaves the default. The admin export is `SELECT *`, so the flag travels in backups.

Tests: `test_migration_adds_share_bests_default_off`, `test_migration_v10_is_idempotent`,
`test_old_v9_envelope_restores_with_sharing_off`, `test_export_round_trip_keeps_sharing_flag`. Update any
assertion that hard-codes version 9.

Produces: the column. Later tasks read it.

### 2. Toggle endpoint

Files: `backend/main.py`, new `backend/test_pb_comparison.py`.

- `PUT /api/personal-bests/sharing`, body model with a strict `bool`. Depends on `acting_profile_id` like
  every data endpoint. Writes only the caller's own row.

Tests: `test_sharing_defaults_off`, `test_sharing_toggle_persists`, `test_sharing_rejects_non_bool`,
`test_sharing_requires_session` (401), `test_toggle_changes_only_the_callers_profile`.

### 3. Read endpoint

Files: `backend/main.py`, `backend/test_pb_comparison.py`.

- Build the per-member best in SQL where it stays simple, otherwise in Python over two small queries. Keep it
  one module-level helper so the scoping can be read in one place.
- The select list is the contract: the helper reads only `exercise_id`, `weight_kg`, `reps` and the owning
  `profile_id` for the join. It never reads `sessions.notes`, `exercise_notes`, names, dates or ids into the
  response.
- Take the top three values, each rounded by `epley()`, descending.

Tests (the privacy cases carry the weight):
- `test_top_lists_three_values_descending`
- `test_top_excludes_the_caller`
- `test_opted_out_member_never_appears`
- `test_opting_out_removes_member_at_once`
- `test_fewer_than_three_members_hides_the_exercise`
- `test_three_values_from_one_member_do_not_qualify`
- `test_logged_sets_in_completed_sessions_count`
- `test_open_session_sets_do_not_count`
- `test_best_is_est_1rm_not_raw_weight` (10 reps at 100 kg ranks above a single at 110 kg only if Epley says so)
- `test_response_has_no_ids_names_or_dates` (assert the exact key set of the JSON)
- `test_only_callers_exercises_are_returned`
- `test_unknown_exercise_absent`
- `test_requires_session` (401)
- `test_member_cannot_read_via_other_profile_header` if any acting-as mechanism exists; otherwise drop it.

Review gate: `staff-engineer-reviewer` on this task alone, before the UI is built (auth and scoping are what a
reviewer on the finished feature would miss).

### 4. Frontend

Files: `frontend/src/pages/PersonalBests.jsx`, its test, `frontend/src/api.js` only if a verb is missing
(`api.put` exists; `api.test.js` asserts the verb surface).

- Load `/personal-bests/top` beside the list. A failed load hides the line and the toggle section's value
  falls back to off; it must not block the page or show an error for a secondary note.
- Under each best: one muted line, `colors.muted`, small size, no icon, no better/worse color. Text shape:
  "Top 3 here: 120, 110, 105 kg est. 1RM". The values come from `top[exercise_id]`; nothing renders when absent.
  Several bests share one `exercise_id`, so the line shows once per exercise group, under the first.
  Check the page's grouping before choosing the anchor.
- Toggle: a checkbox row near the form's heading, label "Include my bests in others' top 3", one sentence under
  it: "Others see only your est. 1RM, with no name." Optimistic update, revert and toast on failure.
- Copy: short, no em dashes. Run `workout-science` on the final strings.

Tests: `shows the top-3 line under a best`, `hides the line when the exercise is absent`,
`one line per exercise when it has several bests`, `toggle sends PUT and reflects the new state`,
`toggle failure reverts and shows an error`, `top load failure leaves the page usable`. Mock the API from the
real surface (the 2026-10-03 `api.put` bug came from a mock written from intent).

### 5. Browser check and expert passes

- Playwright with the `mockApi` pattern at 390px and 320px: line wraps without horizontal scroll, toggle row
  fits. Screenshots go to the scratchpad. Untracked temp spec, deleted before deploy.
- UI and UX expert passes as two separate `general-purpose` agents on the screenshots; adjudicate each claim
  against the source.
- Mocked data only proves layout. Say so in the PR.

### 6. Docs

`AGENTS.md` schema line (v10, `profiles.share_bests`), `docs/CHANGELOG.md`, `STATE.md`. Mark the spec shipped.

## Deploy

This is a schema change, so in this order:

1. Owner (the agent cannot): `scripts/backup.sh` on the host, then an admin `GET /api/export` snapshot. Needs an
   admin session, which the agent has no way to obtain. Listed under Needs owner in `STATE.md`.
2. Agent: `scripts/preflight.sh`, then `scripts/deploy.sh` from a clean tree on `main`.
3. Verify `/api/health` reports the built commit.
4. Verify migration on the host: the live app starts and a second restart is a no-op (idempotent migration).
   Admin `GET /api/admin/backup-status` for the backup posture.
5. Behind the login, which the agent cannot drive: owner checks the toggle and that the line stays hidden
   until three other members opt in. State this as not verified in `AGENTS.md` Status if not done.

Rollback: re-run compose with the previous `APP_COMMIT`. A v9 image reading a v10 database works, since the
extra column is ignored, but a v10 export imported into a v9 app is rejected (unknown column). Do not restore a
v10 envelope into a v9 build; restore the pre-deploy snapshot instead.

## Verification easy to skip

- `git diff` of the response model: the JSON key set is asserted exactly, so adding a field fails a test.
- Run the new tests against a three-profile fixture, not two; most privacy bugs here only show with a third.
- After the migration test, run the whole backend suite: other tests assert `user_version`.
- A thin gym: with the real database there may be fewer than 3 sharing members for a long time. The line
  being absent in production is correct, not a bug. Say so in the PR so nobody reads it as a failed deploy.

## Plan gate

Scope and out-of-scope: written above. Ordered testable steps: tasks 1 to 6. Acceptance tests: named per task.
Open owner question: none. The one wording point (decision 1) is resolved to the spec and flagged.
