# Mobile Home parity (#522) Implementation Plan

> For the executor: use superpowers:executing-plans or subagent-driven-development. Steps use checkbox syntax.
> Write each test first and watch it fail; the plan gives names and intent, not bodies.

**Issue:** #522 `[mobile] Home screen parity`. Child of #201. Foundations (#521, PR #531) are merged.
**Goal:** `mobile/app/(app)/(tabs)/home.tsx` shows what `frontend/src/pages/Home.jsx` shows, with the same
API calls, built from the foundations components and `mobile/src/theme/tokens.js`.
**Effort:** M. **Model tier:** executor on sonnet; no destructive operation, no auth, no backend.

## Scope

In:
- Header: "Next up" / "In progress" eyebrow, `DayIcon` + day name, tag, "Last workout ..." line, "This week: N sessions".
- Start / Resume primary button in the day's accent colour. Start posts `/sessions`; Resume re-reads the open
  session through the existing `workoutStore.resume`.
- Resume banner at the top of Home when the server has an open workout: day accent dot, `DayIcon`, "<Day> in
  progress", elapsed time, "Resume", and the web's two-step discard (trash, then confirm or cancel).
- Exercise preview card for the displayed day (name, alt, sets x reps in the day colour).
- Muscle-group recovery picker (collapsed by default, seven chips with a ring, expanded fact, "Best day for X",
  start button, the estimate disclosure). Hidden when recency failed to load or no group has been trained.
- First-run cards (plan summary line, "No sessions yet."), "Last session" card linking to the History tab.
- Loading skeleton, the shared full-page load error with Try again, error toasts (409 and generic start failure).

Out (each with the reason):
- Day-card list. The web Home has none, and the issue also demands a layout that matches the web page; the web
  starts a non-next day through the muscle picker's best-day button. Issue AC 1 is read as the web behaviour.
  Recorded on the Issue so the owner can overrule it.
- "Edit plan" pill and the first-run "Edit plan" link. The `/plan` route is #527. That PR adds both; do not
  link to a missing route.
- "Export my data (JSON file)". It needs a file-share module, is on no child issue, and is not in this Issue's
  AC. To be filed as its own Issue for the owner to rank.
- Personal-best entry point. The web Home has none (PBs are #526). Analytics paragraph and `VersionStamp`: the
  mobile app has no analytics, and `TopBar` already shows the version.
- A banner on every screen (the web mounts `ResumeBanner` in the shell). Home only here; the Workout and
  History parity Issues decide their own shell.
- Backend, new endpoints, new tokens, new dependencies, `mobile/` CI (the owner's, with another agent).

## Decisions this plan makes

1. **Data layer.** React Query, as `usePlan` already does: `['sessions']` -> `GET /sessions`, `['recency']` ->
   `GET /exercises/recency`. No new store. The two reads fail independently, as on the web: a sessions failure
   replaces the page with the load error; a recency failure only hides the picker.
2. **Open workout source.** The server list, not `workoutStore.active`, decides Resume vs Start (the store is
   empty after an app restart; `resume(days)` already rebuilds it from `/sessions` and `/sessions/<id>`).
   While `sessions` is unreadable neither Start nor Resume is offered (web Wave 1.1 rule: a wrong Start orphans
   the open workout).
3. **Freshness on return.** Home is a tab and stays mounted, so refetch both queries on focus
   (`useFocusEffect` from expo-router). Without this a finished workout leaves "Next up" stale.
4. **Starting.** Use `workoutStore.start(day)` (it already maps 409 to `conflict`). On success navigate to
   `/workout/active`; on `conflict` show the toast "A workout is already in progress" and refetch sessions;
   any other `error` shows "Couldn't start the workout. Try again.". Do not show the store's raw `error` text.
5. **Elapsed time (deviation from the web).** The web banner has none; the Issue asks for it. Computed from the
   session's `created_at` (UTC, no zone suffix, same parse as `parseUtc`) and the current time, rendered as
   "42 min" or "1 h 05 min". It is a label, not a ticking clock: recompute on focus and on a 60 s interval only
   while Home is focused.
6. **Pure logic in TypeScript under `src/`**, because `npm test` runs `node --test` on `src/**/*.test.ts` with
   type stripping. Screens are not unit tested (no RN test renderer in the project and none is added); they are
   verified by being seen (Task 5).
7. **Alternative exercises.** `GET /plan` returns `altExercise` per exercise and the web's `exerciseById`
   indexes it, so sets logged under the alternative still count toward recovery. The mobile `Exercise` type
   lacks the field: add it as optional (`altExercise?: Exercise | null`) in `plan.ts` and index it the same way.
8. **Recovery ring** is a small `react-native-svg` component (already a dependency), colours from the web's
   `ringColor` ramp. The ramp RGB endpoints are existing literals in `MuscleGroupPicker.jsx`; port them as named
   constants beside the ring, no new token.

## Files

Create:
- `mobile/src/home/home.ts` and `home.test.ts`: next day, week count, last-workout label, open session, elapsed label.
- `mobile/src/recovery/muscles.ts`, `recovery.ts` and their tests: port of `frontend/src/lib/muscles.js`, `recovery.js`.
- `mobile/src/components/RecoveryRing.tsx`, `MuscleGroupPicker.tsx`, `ResumeBanner.tsx`, `ExercisePreview.tsx`.
- `mobile/src/home/useHomeData.ts`: the two queries plus focus refetch (thin; no logic worth a test).

Modify:
- `mobile/app/(app)/(tabs)/home.tsx`: replaced by the composed screen.
- `mobile/src/home/index.ts`: re-exports.

Reuse as is: `Screen`/`LoadError`/`LoadErrorHeading`, `Skeleton`, `Card`, `Button`, `DisclosureRow`, `Eyebrow`,
`EmptyState`, `Toast`, `useToast`, `DayIcon`, `StatPair` if a stat reads better than the web's text line
(default: keep the web's text line), `dayColor`, `tint`, `NAV_BAR_HEIGHT` for the toast offset.

## Task 1: Recovery port (pure, TDD)

Files: `mobile/src/recovery/muscles.ts`, `recovery.ts`, tests. Produces: `groupRecovery`, `bestDayForMuscle`,
`bandFor`, `dayLabel`, `localToday`, `daysBetweenDates`, `MUSCLE_GROUPS`, `exerciseById`.

Port the logic unchanged, typed. Keep the research comments that explain a decision; drop the ones that only
point at web files. Port the web tests by name so the intent carries over:
- muscles: `maps every raw tag in the plan to exactly one group`, `weights the primary muscle 1.0 and the rest
  0.5`, `counts an exercise once per group, at its max weight`, `falls back to the longest tau for an
  unclassified exercise`, `breaks the chest tie toward the more rested day`, `treats a never-trained day as
  infinitely rested`, `returns null for a group no day trains`. Use a small fixture plan (the web tests read the
  seed plan; mobile has none, and the live plan is user data). The two web tests that check the seed plan
  (`has no dead tag entries`, `classifies every exercise`) are not ported.
- recovery: `reads Recently trained at 0h`, `Partly recovered at 24h`, `Fresh at 48h`, `applies the 1.5x novelty
  factor`, `caps at 1.0 so freshness never goes negative`, `caps each bout before decay`, the five `bandFor`
  boundaries, `reads Not trained yet, not Fresh`, `parses logged_at as UTC`, `clamps a future timestamp to 0`,
  `counts days by calendar`, `computes localToday in the local frame`.
- [ ] Red: tests above. [ ] Green: port. [ ] Compare outputs with the web functions on one recorded `/exercises/recency`
  response (run both, same input, same `nowMs`); paste the equality result in the PR.

## Task 2: Home logic (pure, TDD)

`mobile/src/home/home.ts`. Functions and the tests that pin them:
- `nextWorkoutId(sessions, cycle)`: `starts at the first day with no sessions`, `takes the day after the latest
  session, completed or not`, `restarts at the first day when the latest day is not in the cycle`, `wraps from
  the last day to the first`, `is undefined for an empty cycle`.
- `openSession(sessions)`: `finds the first session that is not completed`, `is null for a non-array`.
- `weekSessionCount(sessions, todayIso)`: `counts completed sessions in the last 7 days only`.
- `lastWorkoutLabel(sessions, nowMs)`: `reports the empty state`, `ignores in-progress sessions`, `says Today and
  Yesterday rather than a day count`.
- `lastTrainedByDay(sessions, cycle)`: `maps each plan day to its latest completed date`, `ignores in-progress
  sessions`, `ignores days outside the cycle`.
- `elapsedLabel(createdAt, nowMs)`: `reads minutes under an hour`, `reads hours and zero-padded minutes`,
  `clamps a future timestamp to 0 min`, `parses the zone-less UTC string as UTC`.
- `displayDay(active, nextId, plan)`: `shows the open workout's day when one exists`, `falls back to a
  Workout placeholder for a day that left the plan`.
- [ ] Red, [ ] green, [ ] `npm test` passes, `npx tsc --noEmit` clean.

## Task 3: Components

Each is presentational, styled only from `tokens.js`, with `accessibilityRole`/labels as the foundations
components do. 44 pt minimum touch targets.
- `RecoveryRing`: svg track plus arc, colour from the ramp; null freshness draws an empty ring in `colors.border`.
  No animation (the web transition is decorative; keep the reduce-motion question out of this PR).
- `MuscleGroupPicker`: props `groups`, `lastTrainedByDay`, `plan`, `cycle`, `active`, `starting`, `onStart`.
  Wraps `DisclosureRow`; chips in a two-column wrap; one chip expands at a time; shows the raw fact line, the
  days-since label, "Best day for X -> <icon> Name", Start button or "Finish your current session first", and the
  disclosure text verbatim from the web (a trust requirement, never shortened).
- `ResumeBanner`: props `session`, `plan`, `now`, `onResume`, `onDiscard`. Confirm state resets when the session
  id changes. The discard call is `api.delete('/sessions/<id>')` then refetch sessions; a failure shows the
  generic error toast and leaves the banner.
- `ExercisePreview`: card with the "N exercises" eyebrow and rows; `sets x low-high` in the day colour, mono.
- [ ] Each component renders in Task 5; no unit test.

## Task 4: Compose the screen

`home.tsx` order, as the web: toast host, banner (only when open), header block, Start/Resume button,
`ExercisePreview`, `MuscleGroupPicker`, first-run plan card, Last session card, `EmptyState` when no sessions.
- Loading: `Skeleton` blocks for header, button and card (replaces the web's "Loading..." text; the Issue asks
  for a skeleton).
- Error (sessions or plan unreadable): `LoadErrorHeading` "Check your connection" plus `LoadError what="your
  workouts"` with Try again that refetches. No Start, no Resume, no next-day claim, no picker.
- Scroll container clears the tab bar and the safe area as the other tab screens do.
- Last session card is a `Pressable` with `accessibilityRole="button"` that navigates to the History tab.
- [ ] Remove the old placeholder "Exercises" button only if the Exercises route stays reachable another way;
  otherwise keep it as a quiet link below the content and say so in the PR (no web equivalent, do not strand the screen).
- [ ] `npx expo lint`, `npx tsc --noEmit`, `npm test` all clean.

## Task 5: Verification (what makes this mergeable)

Not satisfied by green CI (GUARDRAILS, DECISIONS 2026-10-24).
1. Run the web build of the app from a **separate worktree used only for the preview** (`npx expo start --web`),
   never the PR's own worktree, and open the PWA beside it in Chrome at 390 px. Capture the states: loaded with
   an open workout, loaded without one, first run (no sessions), sessions failing (stop the API), recency
   failing, picker expanded, discard confirm.
2. Dispatch `ux-visual`, `ux-flow`, `ux-mobile` as separate passes from those screenshots; adjudicate every
   finding against source and ledger it (confirmed, rejected with reason, deferred with issue).
3. The owner opens it in Expo Go on the phone (no simulator is installed) and reports back.
4. The PR body states what was seen (Chrome, which states) and what was not (phone until the owner reports; any
   state not reachable). If the phone check has not happened, say so and leave merge to the owner.
5. Stop the preview server before `gh pr merge`, and merge from a worktree no server runs in.
6. No deploy: `mobile/` does not touch the PWA or the backend.

## UI acceptance criteria (from the UX recommendation on the Issue)

- Same information order and hierarchy as the web Home at 390 px; no new colours or sizes outside `tokens.js`.
- Start and Resume never both shown, and neither shown while sessions are unreadable.
- Every state in Task 5 step 1 renders without overflow at 320 and 390 px, and with the larger system text size.
- Tap targets 44 pt or more: Start/Resume, chips, banner actions, Last session card.
- Chip state is not colour-only (band text under each label); the disclosure paragraph meets 4.5:1 (`muted2`).
- Reduce motion respected (skeleton already does).

## Risks and traps

- `GET /sessions` returns at most 60 rows, newest first by `created_at`; `nextWorkoutId` and "Last session" rely
  on `sessions[0]`. Do not re-sort by date on the client.
- `sessions.date` is server-local and `logged_at`/`created_at` are UTC; keep the two clocks as the web does.
- A day key can leave the plan after an edit: the open session's day may be missing from `plan`. `resume(days)`
  already reports it; the banner falls back to "Workout in progress".
- `workoutStore.start` is guarded by `busy`; do not add a second in-flight flag, read `busy` for "Starting...".
- Port, do not import: `mobile/` cannot reach `frontend/src`. If a ported function and its web original drift,
  the Task 1 comparison is the check; note it in the PR rather than adding a shared package.

## Review, PR and merge

- Feature branch `feat/mobile-home-522` from current `origin/main`, one PR, title `[mobile] Home screen parity (#522)`.
- Run `staff-engineer-reviewer` on the diff; a bot review counts only if it shows it read the diff.
- Merge after CI green and Task 5 complete, per GUARDRAILS. No deploy.
- Write-back: orchestration checkpoint for #522, then #523 (Workout) is next in the series.

## Spec coverage

Issue AC: day cards (read as web Home, see Scope), resume banner with elapsed time (Task 3, decision 5), last
session and recovery entry point (Tasks 1, 3, 4), skeleton and load error (Task 4), layout and tokens (UI
criteria), unit tests and lint/tsc (Tasks 1, 2, 4), phone check and expert review (Task 5).
