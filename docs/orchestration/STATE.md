# Orchestration State

> Single-owner cursor for `/orchestrate`. Only the orchestration home branch may edit the sections
> below; a feature branch must never touch this file. **Hard budget: ~250 lines.** Every tick reads
> this file first, so its cost is per-tick and compounding — that is what keeping it bounded is for.
>
> **Home branch:** (none — this repo commits orchestration docs straight to `main`)
> **Project number:** (none yet — create one with `gh project create`, then run
> `scripts/create_board_view.sh <owner> <number>`)
> **Project owner:** (defaults to `@me`, the authenticated `gh` user — set explicitly only if the
> Project belongs to a different login or an org)
>
> **This file keeps no Tick log.** Each tick's write-back goes straight to `HISTORY.md` — prepended
> at the top, verbatim, per PLAYBOOK step 7 — and Cursor's "Current focus" carries the live summary
> instead. Resolved Needs-owner items move to `HISTORY.md` the same way. A "keep the last 2-3 ticks"
> rule was tried first here and still regrew past budget, since Cursor and Needs-owner grow on their
> own regardless of the tick log; keeping no tick log at all, rather than a rolling window, is what
> actually stops it recurring. `DECISIONS.md` is separate and is never compacted.

## Cursor
- **Project:** Workout Tracker
- **Current focus:** Accounts, continued. Since this cursor was last updated, **#84** (schema v6 +
  auth core) and **#85** (Resend invite/reset, rate limiting, owner bootstrap) both shipped and
  merged — the standing approval recorded below covered both. The owner then personally found and
  filed a real cross-profile data leak (reads were never scoped to a profile, only writes were,
  since #66) and it shipped same-day as **#110** (merged via #112): a single `acting_profile_id(conn)`
  seam now scopes every read and 404s cross-profile `PATCH`/`DELETE`, independently of login. That
  makes **#86** smaller than its issue body still says (comment posted narrowing it to: swap the
  seam's body for a real session lookup, delete `_default_profile_id`, trim `/api/health`, gate
  `/api/events`, add the frontend route guard + 401 handler). #86 also had its login/set-password
  *screens* split out into new **#105** on 2026-09-05, so the UI can be used and proven before the
  gate closes — #86 now only turns the door. Housekeeping shipped in the same window: backup
  heartbeat → status file + weekly cron (#88), local/off-site backup status split apart (#93),
  off-site Google Drive backups re-authorized and working but still on a 7-day clock the owner
  deliberately deferred fixing (#94), active alerting deferred (#89), a CI secrets/env-file scan
  (#111), deploy env vars moved to a target-side `.env` (#108), a Resend User-Agent/error-message
  fix (#109). Owner deprioritized **#27** (public access) to P3 (2026-09-05): it waits until the
  accounts system has been used for real, not just tested in CI. Intake otherwise unchanged:
  #30/#32/#33 have specs but no `ready` children; #70 unshaped.
- **Process note:** none of the above (10+ merged PRs, #101 through #112) was ever written back to
  this Cursor/Tick log — reconstructed this tick from `git log` and live GitHub issue/comment state,
  which were themselves current and consistent throughout. Only this file had drifted. Full
  reconstruction is in this tick's log entry below.
- **Next action:** **#105 is executing** under the standing approval recorded in `DECISIONS.md`
  (2026-09-05, "Standing approval: the accounts workstream (#105, #86, #87)"), which names it
  explicitly. The owner re-confirmed that reading live this tick. **No `approved` label was added by
  the runner and none is needed** — that is exactly what the standing-approval mechanism provides.
  #86 → #87 stay blocked behind it and are covered by the same record when their turn comes.

  **Correction, same tick:** an earlier pass of this file (and PR #113 before it) reported that no
  standing approval existed and that #105 was blocked on `/orchestrate approve 105`. That was wrong,
  and the reason it was wrong is the finding below.

  **This tick took the intake track** since the `ready` track was blocked: picked #30 (highest-ranked
  intake after #27, which the owner deferred to P3). It stays `intake` — its spec exists and is
  complete, but the spec's own Status block gates splitting on an owner skim that has not happened.
  Refreshed that spec instead (#114, merged) so the skim lands against reality: it still named the
  superseded #67 as its login dependency and still told an executor to scope rows with
  `_default_profile_id`, the exact call site #86 exists to delete. Also learned the dependency is
  narrower than the spec assumed — #110 shipped per-profile scoping independently of login, so
  #30/#32 wait only on #86 swapping the `acting_profile_id(conn)` seam to a session lookup.

## Stop-condition
(none — runner proceeds normally)

## In-flight
(no branches in flight)

## Needs owner
- **#30/#32 need a spec skim, not a decision.** `docs/superpowers/specs/
  2026-08-31-ai-structured-io-design.md` (refreshed and current as of #114) gates itself on an
  owner skim before either Issue may be split into `ready` children; every fork-in-the-road
  question in it was already answered by owner Q&A on 2026-08-30. **2026-09-06:** #33 (nutrition)
  merged into #32 by direct owner decision, so the spec now needs the nutrition/in-app-AI-query
  scope folded in *before* the skim means anything. Until then #30/#32 stay `intake`.

For everything else currently open, see `STATE.md` on the orchestration home branch
(`claude/workout-tracker-backlog-bu9qnw`) — this file lags it by design (`DECISIONS.md`
2026-09-04) and is refreshed only periodically via `copier update`/manual sync, most recently
2026-09-10. The Cursor section above is similarly a snapshot, not a live status.
