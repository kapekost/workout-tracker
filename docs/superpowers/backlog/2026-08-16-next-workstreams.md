# Next workstreams — captured 2026-08-16

**Status: CAPTURED, NOT DESIGNED.** Nothing here has been through brainstorming. Each
workstream below needs its own `superpowers:brainstorming` → spec → plan → implementation
cycle before any code is written. This document exists so the ideas and their constraints
survive; it is deliberately not a design.

**Update 2026-08-17: the muscle-group picker + recovery estimate SHIPPED and is
deployed** (`ff1eea4`), so nothing is blocked on it any more. Sequencing item 1
below is done; item 2 (D, design-system decision) is next. Research groundwork for
D, B and C was gathered 2026-08-17 into `docs/superpowers/research/2026-08-17-*.md`
so each brainstorming session starts informed rather than exploring live.

**Update 2026-08-17 (later): `/api/import` hardened and deployed** (`adbf3f5`).
The profiles research below (section B) surfaced two defects on the
disaster-recovery path — restore counts trusted the envelope instead of the
DB, and the envelope gate would have broken every existing backup the moment
a table like `profiles` was added — both fixed via TDD ahead of any schema
work. Full writeup: `docs/CHANGELOG.md`. D (design-system decision) is next;
nothing else here has moved.

---

## A. Audit: what older work was left undone

**Asked:** "preview what older tasks we have in notes and left undone — I think we were
planning a way to register old Personal Bests on some lifting workouts and exercises, so
they can be counted towards our progress."

**Searched:** `AGENTS.md` (Status, Backlog, action items), `docs/CHANGELOG.md`, and every
file under `docs/superpowers/{specs,plans,research,audits}`.

**Finding — the Personal Bests idea is NOT in any backlog. It was never captured.**

What exists is an *adjacent* shipped feature that likely seeded the memory: **PR baselines**
(2026-06-30 wave, `docs/superpowers/specs/2026-06-30-responsive-audit-pr-baseline-design.md`,
shipped per `docs/CHANGELOG.md:67-68`). That work made a first-ever entry for an exercise
emit a muted `baseline` marker instead of a fake "New PR 🎉". It solves *"don't celebrate a
number you just made up"* — it does **not** let you enter a lift you achieved before you
started using the app.

So the gap is real and currently unaddressed: **every PR in the app is computed only from
sessions logged inside the app** (`backend/main.py` `session_prs` and `all_progress` both
join `sessions` with `s.completed = 1`). A user with years of prior training starts from
zero, and their genuine bests are invisible to progress charts and PR detection.

**Genuinely open items found in the backlog** (all infrastructural, none feature work):

| Item | Source | Note |
|---|---|---|
| Idle rest-timer hint ("Log a set to start rest timer") | AGENTS.md Backlog | The one surviving deferred **UI** item from the 2026-06-30 responsive sweep |
| Scripted one-command deploy (build + transfer + restart) | AGENTS.md Backlog | Partly mitigated 2026-08-16 by the new Local development section |
| Pin image to a version tag instead of `:latest` | AGENTS.md Backlog | Rollback story |
| `tailscale up --ssh` | AGENTS.md Backlog | Needs physical access to the Pi |
| rclone personal `client_id` | AGENTS.md action item | ⚠ **escalated twice**; shared client_id retires during 2026 and backups will start failing |
| PSU replacement | AGENTS.md Blocked-on-user | Confirmed under-voltage `0x50005` |

**Recommendation:** the Personal Bests idea is not a standalone workstream — it is the
natural first consumer of the import format in **workstream C**. Design them together.

---

## B. Profiles (username-only, no security)

**Asked:** "create login accounts with just username for now, no security, just pick-a-profile
kind of thing. And show the icon / name at the top."

### What exists today
The app is **single-user by construction**. There is no user concept anywhere: `sessions`,
`sets`, `exercise_notes` and `events` have no owner column. `backend/main.py` states the
no-auth assumption explicitly and deliberately omits CORS middleware on the grounds that it
is a "single-user LAN app".

### Why this is the heavyweight item, despite sounding small
This is the **first change in this project's history that requires a schema migration**. The
muscle-recovery work was explicitly designed to avoid one. Consequences, straight from
`AGENTS.md`:

- Every owned table needs a profile column and a backfill for existing rows.
- A **pre-deploy `/api/export` snapshot becomes mandatory**, not optional.
- A **restore drill is required after the schema change** (last drill: 2026-07-09).
- `/api/export` and `/api/import` envelopes change shape — the import path is destructive
  (`mode: replace`) and is the disaster-recovery mechanism, so it must not be broken.

### Questions brainstorming must settle
1. Is a profile an **owner of data** (rows are partitioned) or just a **label**? This is the
   whole design; everything else follows.
2. What happens to the existing single user's data on migration — become "default profile",
   or prompt on first launch?
3. Where does profile selection live — a gate before Home, or a switcher in `TopBar.jsx`?
4. Does the PWA remember the last profile per device (localStorage), and is that the *only*
   persistence?
5. "Icon" — emoji picker, generated avatar, or initials? (Emoji matches the app's existing
   visual language: plan days already use 💪 🦵 🏋️ 🔥.)
6. **Honest scoping question:** the repo is public and the app is reachable over the tailnet.
   "No security" is fine for a household; it should be a stated, deliberate decision in the
   spec rather than an omission, and the spec should say what would have to change if that
   ever stops being true.

---

## C. Import — bring outside training in (incl. historical Personal Bests)

**Asked:** "support import and provide a prompt for someone who wants to provide an import of
workouts — say from iPhone Notes, a Claude or other AI can read the notes and provide a format
we can upload in the app for that profile to update their lifting progress or personal best."

### What exists today
`POST /api/import` already exists — but it is a **disaster-recovery** endpoint: it takes a
full `/api/export` envelope, `mode: "replace"`, wipes the DB, auto-snapshots first, and is
guarded by `confirm: true`. **It is not a merge/append path and must not be repurposed into
one.** This workstream needs a *separate, additive* ingest route.

### The interesting half is the prompt, not the endpoint
The deliverable is really two artifacts:
1. A **strict, versioned JSON schema** the app accepts.
2. A **copy-pasteable prompt** the user hands to an AI along with their notes, which makes
   that AI emit exactly that schema.

The prompt is a user-facing product surface. It has to be robust to the reality that an LLM
reading messy gym notes will guess — so the schema needs a place for uncertainty, and the app
needs a **review-before-commit step**. Never let a third-party AI's output write directly to
the database unseen.

### Questions brainstorming must settle
1. Two modes or one? **(a)** historical PBs — one row per exercise, a best lift, an
   approximate date; **(b)** full sessions — dated workouts with sets/reps/weight. (a) is
   much simpler and directly answers workstream A.
2. If a PB is imported with no session behind it, **how does it interact with PR detection?**
   The current logic derives PRs from `sets` joined to completed `sessions`. Options: a
   synthetic session, or a separate `personal_bests` table consulted by the PR comparison.
   This is the crux — get it wrong and either the charts lie or the PR logic forks.
3. Units, and how to handle lb→kg (`weight_kg` is the stored unit throughout).
4. Idempotency: what happens when the same notes are imported twice?
5. Does an import ever *overwrite*, or only add?
6. Depends on **B** for "that profile" to mean anything. Sequence accordingly.

---

## D. UI/UX rethink, end to end

**Asked:** "rethink the UI/UX from start to finish and reimagine how the app serves good UI/UX
on iPhone and browsers."

### What exists today
- Mobile-first, dark, **inline-style React** with a handful of utility classes (`.card`,
  `.btn-primary`, `.tap-target`) in `frontend/src/index.css`. Tailwind is a dependency but the
  codebase overwhelmingly uses inline styles.
- A 2026-06-30 responsive audit exists — `docs/superpowers/audits/2026-06-30-responsive-catalog.md`
  — and its remediation shipped 2026-07-10: **≥44 px tap targets, no horizontal overflow down
  to 320 px**. That is a real, tested baseline; a rethink must not silently regress it.
- Installable PWA (`vite-plugin-pwa`, autoUpdate, offline app-shell fallback).
- Screens: Home, Workout, History, Progress, Exercise, plus `TopBar` / `NavBar` /
  `ResumeBanner` / `TimerBar`.

### The sequencing question that must be answered FIRST
This workstream conflicts with B, C, and the in-flight muscle-recovery work — all of which
add UI. Three options, and brainstorming should pick deliberately:

- **Rethink first**, then build B/C into the new system. Least rework, but delays features
  and puts the in-flight picker at risk of being redesigned right after it ships.
- **Build first, rethink after.** Features land sooner; the rethink then has more surface to
  unify — and more to redo.
- **Rethink as a design system only** (tokens, spacing, type scale, component vocabulary),
  adopted incrementally. Probably the sane middle path given this is a hobby app on a Pi,
  but it must be an explicit choice, not a drift.

### Constraints any redesign inherits
- The device is a phone in a gym: **one-handed, sweaty, glanceable, often poor wifi**. The
  primary interaction is logging a set between efforts.
- Backend is a Raspberry Pi 3 B+ with ~1 GB RAM; the frontend is built on the Mac. Bundle size
  and request count are real constraints — a 22-request fan-out was already a documented bug.
- Must stay installable and work offline for the app shell.
- The `dataviz` skill is installed and is the right tool for chart/meter work.
- Keep the ≥44 px / 320 px floor from the responsive sweep.

---

## Suggested sequencing

1. ~~Finish muscle-group picker + recovery~~ — **done, deployed 2026-08-17.**
2. ~~Harden `/api/import` (restore counts, envelope gate, user_version rollback)~~ — **done,
   deployed 2026-08-17** (`adbf3f5`). Surfaced by the profiles research below; had to land
   before B could touch the schema.
3. **D, but only as far as a design-system decision** — because B and C both add UI, and
   deciding the vocabulary first is cheap while redoing screens is not.
4. **B (profiles)** — schema migration, export/import envelope change, mandatory restore drill.
5. **C (import + AI prompt)** — depends on B; absorbs the historical-PB idea from A.
6. Fold in the stray backlog items (idle rest-timer hint) opportunistically.

**Unrelated but overdue, and it fails silently:** the rclone `client_id` action item in
`AGENTS.md`. The shared client_id retires during 2026 and nightly backups will start failing
as `stale`/`failed` in `/api/health`. It needs ~10 minutes of the user's Google login and has
already been escalated twice.
