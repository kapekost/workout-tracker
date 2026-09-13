# Orchestration Playbook

> How `/orchestrate` runs. Obey `GUARDRAILS.md` (it wins on conflict). Source of truth for tasks is
> GitHub Issues + Projects (see below); this file is *how* to drive them. Reuse superpowers skills —
> do not reinvent.

## When to actually use this

The Project board and the intake/triage machinery below earn their keep once a repo has ongoing,
real feature work moving through it — not from the first commit. A one-off fix, or a repo nobody's
actively driving feature requests into yet, doesn't need Issues, a ranked board, or
clarifying-question ceremony: just do the work directly. Turn this on once a product owner starts
bringing feature requests you'd otherwise have to remember and sequence yourself.

## Project board setup (one-time per repo)

A GitHub Projects v2 board is where the owner ranks work (drag order = priority — see step 2)
and, once created, gives a real Kanban view for free: run
`scripts/create_board_view.sh <owner> <project-number>` once, after the Project itself exists
(`gh project create`), and it adds a Board-layout view. No further configuration is needed — a
freshly created Board-layout view groups by the `Status` single-select field automatically, with
real Todo/In Progress/Done columns, even though the public GraphQL API has no way to *set* that
grouping explicitly (`ProjectV2ViewConfigurationInput` only exposes `visibleFieldIds`; there is no
group-by input). Verified empirically 2026-09-10, not assumed from docs. The script is idempotent
— safe to re-run, it skips creating a duplicate if a board view already exists.

Note what this does *not* solve on its own: the `Status` field's `Todo`/`Done` values already
track `state:OPEN`/`state:CLOSED` via GitHub's own built-in automation, but nothing yet writes
`In Progress` when a tick actually claims an Issue (see `STATE.md`'s `## In-flight` section for
where that claim already lives) — so today the board shows two real columns and one empty one.
Wiring that write is tracked separately; it needs its own design, not a same-file follow-on here.

## Feature intake (product owner → Issues)

A high-level feature request from the product owner — in conversation, not yet an Issue — does not
go straight to code, and does not get invented scope on their behalf.

1. **Ask clarifying questions** to shape it: the actual user-facing outcome, what's explicitly out
   of scope, constraints, rough priority. Do not guess at intent — the same "never guess" principle
   GUARDRAILS applies to destructive-op approval applies here to scope.
2. **Capture the raw ask as a single Issue labeled `intake`, via `scripts/create_issue.sh intake
   --title "..." --body-file <path>`** — never a bare `gh issue create`. Even a rough capture beats
   losing the ask to context. `intake` means "not triaged at all yet"; it is a different state from
   `needs-clarification` ("was triaged and failed" — see the Triage / INVEST gate below). Neither is
   `ready`.
3. **Run it through the Triage / INVEST gate.** If it's small enough as one Issue, relabel `intake` →
   `ready` (or `needs-clarification` if it still doesn't pass) directly. If it needs splitting, open
   properly-scoped child Issues via the same `scripts/create_issue.sh <state> --title ... --body-file
   ... --label "type:...,priority:...,effort:..."` (type/priority/effort labeled, INVEST-checked,
   referencing the `intake` Issue), then close the `intake` Issue with a pointer to its children.
   **`scripts/create_issue.sh` exists specifically to make two failure modes structurally impossible:**
   a bare `gh issue create` bypasses the ISSUE_TEMPLATE form's `intake` default (real case: a child
   created alongside three siblings landed with type/priority/effort but no state label at all,
   invisible to both `gh issue list --label ready` and intake triage, unnoticed for three days) —
   the script's first argument is a required state label, so this can't happen. It also bypasses the
   Project board entirely (real case, 2026-09-13: 9 new `intake` Issues plus 7 pre-existing open ones
   — including 3 already `ready` — existed only as bare Issues, invisible to `/orchestrate`'s actual
   picking query in step 2/3 below, which reads the board via `gh project item-list`, never `gh issue
   list`) — the script adds every Issue it creates to the Project board with Status `Todo` in the same
   call. **Never call `gh issue create` directly** for any Issue this repo's `/orchestrate` is meant
   to see (GUARDRAILS.md).
   **A third outcome**: owner Q&A can shape real direction — what to build,
   what's explicitly out of scope — without yet producing something concrete enough to size or split.
   The mechanism itself still needs a written spec (this repo's `docs/superpowers/specs/` convention,
   typically via `superpowers:brainstorming` → spec → plan) before it can become `ready`. When that
   happens: record the decision (a comment on the Issue plus a `DECISIONS.md` entry, same as any
   other owner call), leave the Issue `intake` — not `ready`, not `needs-clarification`, the gate
   didn't fail, it just isn't finished — and note in `STATE.md` that it's waiting on a spec, not an
   owner answer. Seen 2026-08-30 on #27/#30/#32/#33, distinct from #29's Q&A, which was concrete
   enough to split into `ready` children directly.
4. An unattended `/orchestrate` tick that reaches an `intake`-labeled Issue and can't resolve steps
   1–3 without the owner (the clarifying questions have no answer yet) treats it exactly like a
   failed INVEST gate: relabel `needs-clarification`, stop, flag for the owner. Never guess and never
   invent an answer to keep moving.

## Command variants (dispatch on the argument)
- `/orchestrate` (no arg) — run the next tick.
- `/orchestrate status` — run `scripts/orchestrate_status.sh` and print its output verbatim.
  **No execution, no writes.** Cheapest path. See "Status report" below for the exact format.
- `/orchestrate approve <issue-number>` — **human-only**, never dispatched by an unattended tick (see
  GUARDRAILS "Approval is human-only"). When a human runs it: add the `approved` label to the given
  Issue, comment why, stop.
- `/orchestrate plan <issue-number>` — write the detailed plan for an Issue lacking one, via
  `superpowers:writing-plans`, then stop.
- `/orchestrate review-feedback` — run only step 8 below (feedback review), then stop. Also runs
  automatically at the end of any tick that logged a new `IMPROVEMENTS.md` entry.
- `/orchestrate stop` — set `STATE.md` → Stop-condition to "owner stop", commit, stop.

## Status report

`scripts/orchestrate_status.sh` prints exactly this shape:
```
READY (3): #127, #138, #137
IN PROGRESS (1): #125 — claimed 2026-09-10T03:54Z, paused (owner go-ahead pending)
BLOCKED (0)
NEEDS OWNER (2): #30/#32 spec skim; 2 [template] items open in agent-scaffold
INTAKE (2): #152, #148
IMPROVEMENTS: 25 logged, 5 [unsure] open (oldest: 11 days)
```
Every line is empty-safe — `BLOCKED (0)` prints plainly, absence of blocked work is itself
useful information, not an omitted line.

Every number and list comes from a source already kept accurate for other reasons, never from
new stored state:
- **READY** — `gh project item-list`, ranked (the Project's manual drag order — the same source
  step 2/3 use to pick the next Issue; deliberately not `gh issue list`, which cannot sort by
  that rank at all).
- **IN PROGRESS** / **NEEDS OWNER** — the orchestration home branch's own `STATE.md`
  `## In-flight` / `## Needs owner` sections, read via `git show origin/<home-branch>:...`, never
  the working tree's copy (which is deliberately not kept current — see that file's own header).
  A repo with no distinct home branch (`STATE.md`'s "Home branch" field left at its default)
  reads the working tree directly instead.
- **BLOCKED** / **INTAKE** — `gh issue list --label blocked`/`--label intake`, open only.
- **IMPROVEMENTS** — parsed from the home branch's `IMPROVEMENTS.md`: total entries, how many
  are `[unsure]`, and the oldest `[unsure]` entry's age in days.

Requires `STATE.md`'s "Home branch"/"Project number" header fields to be filled in for the
READY/IN PROGRESS/NEEDS OWNER/IMPROVEMENTS lines to resolve against the home branch — a fresh
scaffold with neither set still runs, reporting `READY (unknown — no Project number set in
STATE.md)` and reading the working tree for the rest (IMPROVEMENTS included — it follows the same
home-branch switch as IN PROGRESS/NEEDS OWNER). A third field, `**Project owner:**`, defaults to
`@me` (the authenticated `gh` user) if left at its placeholder — set it explicitly only when the
Project belongs to a different login or an org.

## Triage / INVEST gate
Before an Issue gets the `ready` label, it must pass a basic INVEST sanity check (Independent,
Negotiable, Valuable, Estimable, Small, Testable — see the `feature` issue form). If it clearly
fails — too vague, too large for its stated effort, or not independently actionable — label it
`needs-clarification` instead of `ready` and stop; do not guess at intent. An Issue arriving via
Feature intake starts labeled `intake`, not `needs-clarification` — see that section above for the
distinction.

**Cross-repo propagation scope is its own effort-size red flag**, separate from line/file count
within this repo. An Issue whose scope names other repos (a template sync, a policy propagated to
every consumer repo) can be genuinely `effort:S` only when the change itself is small and already
fully worded — otherwise "propagate to N repos" silently multiplies a single-repo estimate by N
PR/CI cycles. Real case, #137 (2026-09-13): landed `effort:S` and scoped to workout-tracker plus
three consumer repos plus the `agent-scaffold` template; executed directly in one tick only because
the actual edit was a small, already-worded markdown block, not because the label was right. Check
this at triage time, not discovered mid-execution.

Issue dependencies are tracked with the **`blocked` label**, and the blocking Issue is named in
the blocked Issue's body. This file previously mandated GitHub's native issue-dependency
relationship and explicitly forbade a label — that instruction never worked and was never followed:
the GraphQL field it points at does not exist on this API (`issueDependenciesBlockedBy` →
`undefinedField`), so step 3's "no unresolved dependency" check has always silently passed. The
label is what practice actually uses (#85/#86/#87 all carry it today), so the label is what the
runner checks. Revisit only if GitHub ships a dependency API `gh` can reach.

## Claiming work (avoid concurrent-tick collisions)

More than one `/orchestrate` tick can be alive at once — a live, human-attended session and an
unattended scheduled routine, or two routines. Checking `gh pr list` in step 2 below is not
sufficient on its own to catch this: a tick can spend real time on an Issue (research, writing,
testing) before ever pushing a commit or opening a PR, and during that window an open-PR check
sees nothing. This happened for real on 2026-08-30 (see `STATE.md`'s #34 tick log entry) — caught
only because the owner happened to ask about it, not by anything in this file. Hence this section.

- **Before picking any work** (step 2/3 below), read `docs/orchestration/STATE.md`'s In-flight
  section from the **live `claude/workout-tracker-backlog-bu9qnw` branch**, not `main` — a claim
  may not have reached a merged PR yet. A claim naming an Issue with a timestamp less than 2 hours
  old means another driver is already active on it: do not pick any new work this tick; log it in
  the tick log and stop (step 9). A claim 2+ hours old is almost certainly an abandoned/crashed
  tick, not an active one — clear it in the same commit as the new claim below, noting the cleanup
  in the tick log.
- **The instant an Issue is picked** — before the plan/split/destructive-check branches below,
  before dispatching a subagent, before touching any source file — commit and push a claim
  *directly* to `claude/workout-tracker-backlog-bu9qnw` (no PR for the claim itself; the full
  `STATE.md` write-back with narrative still goes through the normal PR flow at step 7):
  ```
  ## In-flight
  - **#NN** — claimed <ISO 8601 UTC timestamp>, <"live session" | "scheduled routine">.
  ```
  This push is what actually prevents the collision, not the read in the bullet above: if it's
  rejected as non-fast-forward, another tick claimed first — fetch, see which Issue won, back off
  per the previous bullet. Never force-push to resolve this. Claim first, work second, always in
  that order — a tick that starts executing before its claim has landed is exactly the bug this
  section exists to close.
- **On completion** (shipped, or any stop condition), clear the claim as part of step 7's normal
  write-back — `## In-flight` returns to `(no branches in flight)`.

## The tick (for `/orchestrate` with no arg)
1. **Read** `STATE.md`, `GUARDRAILS.md`, `DECISIONS.md` — **from the live
   `claude/workout-tracker-backlog-bu9qnw` branch, not the working tree and not `main`.** The home
   branch never merges to the default branch (`DECISIONS.md` 2026-09-04), so `main`'s copies of
   these files are a partial, hand-cherry-picked subset that silently lags. This is not a
   hypothetical: on 2026-09-05 two consecutive ticks read `main`'s `DECISIONS.md`, found no standing
   approval in it, and reported the accounts chain as blocked on an owner approval that had in fact
   been recorded on the home branch hours earlier — the second tick only caught it because a merge
   conflict exposed 28 commits `main` had never seen. Read them with
   `git show origin/claude/workout-tracker-backlog-bu9qnw:docs/orchestration/<file>`, or from a
   worktree checked out on that branch. Do not read source files yet.
2. **Reconcile reality:** `git status`, `gh pr list`, and `gh project item-list 3 --owner "@me"
   --query "status:Todo label:ready"` for the ranked `ready` queue — **not** `gh issue list`, which
   has no notion of the Project's manual rank at all (no such sort exists in its flags) and was
   wrongly documented here as if it did. `gh project item-list`'s own item order already *is* the
   board's manual rank — confirmed empirically: an item dragged to a new position in the Todo
   column of a Board-layout view (see "Project board setup" above) moves in this same output,
   immediately, because both read the one underlying position GitHub stores per item. If reality
   diverged from `STATE.md`, correct `STATE.md` and
   continue. **Also sweep for open Issues carrying no state label at all** — e.g.
   `gh issue list --state open --json number,title,labels` filtered to those with none of `ready` /
   `intake` / `needs-clarification`. A label-filtered query cannot report what it never matches, so
   without this sweep a state-less Issue is invisible to every tick indefinitely. Give each one a
   state before continuing. **Also sweep for open Issues missing from the Project board entirely**
   — same failure class, different cause: `comm -23 <(gh issue list --state open --json number -q
   '.[].number' | sort) <(gh project item-list <N> --owner <owner> --format json --limit 300 -q
   '.items[] | select(.content.number != null) | .content.number' | sort -u)` (both sides must use
   plain lexicographic `sort`, not `sort -n` — `comm` compares lines as text, and numeric sort order
   diverges from it once numbers have different digit counts). Real case, 2026-09-13: 7 open Issues,
   including 3 already `ready` (#141/#145/#157), existed only as bare Issues and were invisible to
   this step's own `gh project item-list` query above — `scripts/create_issue.sh` (see Feature intake
   above) prevents new instances; this sweep catches any that predate it or slip through some other
   path. Add each one to the board with Status `Todo` before continuing. Also check for new owner comments since the last tick on any Issue currently in
   progress, or any `intake`/`needs-clarification` Issue awaiting an answer
   (`gh issue view <n> --comments`, or `gh api` filtered by date if scripting it across many Issues) —
   respond to them (answer, incorporate the feedback, or act on it) before picking the next action.
   A comment sitting unanswered across a tick boundary is a bug in the loop, not something to defer.
   **Also check the live In-flight claim per "Claiming work" above** — this is a separate check from
   `gh pr list` and catches what that can't (work in progress that hasn't reached a PR yet).
   **Also check that `PLAYBOOK.md` and `GUARDRAILS.md` haven't diverged from `main`** —
   `diff <(git show origin/main:docs/orchestration/PLAYBOOK.md) docs/orchestration/PLAYBOOK.md`
   (and the same for `GUARDRAILS.md`). Unlike `STATE.md`/`DECISIONS.md`, which only the orchestrator
   edits, these two are general policy docs an ordinary feature PR or a `copier update` can
   legitimately touch directly on `main` — so the usual "home branch is ahead, `main` lags"
   direction can invert for just these two files, with nothing else here to catch it. Real case,
   2026-09-13: PR #175 (the `create_issue.sh` mandate) and two `copier update`s added real policy —
   the Project board setup section, the Status report section, the `create_issue.sh` mandate itself
   — to `main`'s copies that never reached the home branch, so a tick reading these files as
   canonical per step 1 was quietly working from the stale copy, in the direction step 1's own
   rationale doesn't cover. If they've diverged, reconcile onto the home branch (adopt whatever
   `main` has that the home branch lacks) before continuing — never silently pick one without
   comparing.
3. **Pick the next action.** Intake triage and `ready`-issue execution are independent, non-blocking
   tracks — an untriaged `intake` Issue does not block picking a `ready` Issue this tick
   (`DECISIONS.md` 2026-08-30 "Sequencing"). Pick the highest-ranked open Issue with the `ready`
   label, not carrying the `blocked` label; if none exists but `intake` Issues are waiting,
   resolve the highest-ranked one via the Feature intake flow above instead. **The moment an Issue
   is picked, push its claim per "Claiming work" above — before any of the branches below, before
   any execution.** Then:
   - **Spot-check that the Issue's premise still holds against current `main`** — a cheap grep for
     the file/behavior its own reproduction names, not a full re-investigation. An Issue can be
     filed against a real bug and then have that exact bug fixed as a side effect of unrelated later
     work, with nothing to un-ready it in the meantime. Real case, #127 (2026-09-13): filed against
     a Dockerfile missing a `COPY` line, but that line had already merged the day before via an
     unrelated PR — the Issue was simply never re-validated and sat `ready` for a week. If the
     premise no longer holds, close the Issue with the evidence and move to the next one instead of
     dispatching a subagent to redo already-shipped work.
   - If it is **destructive** (per GUARDRAILS) and is neither `approved` nor covered by a standing
     approval in `DECISIONS.md` → skip to the next ready Issue; if none, stop + notify. Check the
     "Always needs a fresh human approval" list in GUARDRAILS first — a standing approval never
     covers those, nor work that has grown beyond the spec it was granted against.
   - If it is `effort:L`/`XL` and has no sub-Issues yet → split it per GUARDRAILS "Task sizing" and stop.
   - **If it is not decomposed → plan it** (the `/orchestrate plan` flow) and stop. See "The plan
     gate" below for what decomposed means. **Gate on decomposition, not on effort size** — an
     Issue whose spec already lays out an ordered, testable sequence gets executed, whatever its
     effort label says.
   - Else → execute.
4. **Execute** via `superpowers:subagent-driven-development`. Lean: dispatch one subagent per task; it
   reads only the Issue + its plan doc + the named files, never the whole tree. **Pick the dispatch
   model per task per "Model tiering for dispatched work" below** — this is a per-dispatch decision,
   not a default left to whatever the controller happens to be running. If context bloats
   mid-task per GUARDRAILS, checkpoint and hand off to a fresh subagent rather than pushing through.
   Dispatch with worktree isolation whenever the subagent does its own branch/commit work, and
   remember what a fresh worktree does *not* have: `backend/.venv` and `frontend/node_modules` are
   gitignored and are not shared with the main checkout (`AGENTS.md` says so under Setup). Hand the
   subagent the main checkout's absolute interpreter path, or tell it to install first — otherwise
   its verification commands fail for reasons that have nothing to do with the change it made.
   **Friction goes in the subagent's final report, not into `IMPROVEMENTS.md` directly** (this
   overrides the template default of having the subagent run
   `scripts/append_improvement.sh` inline — deliberately, not an oversight: see below). The
   improvements log and its `last-reviewed-count` cursor belong to the home branch — that is where
   every tick appends and where step 8 reads from. A subagent on a feature branch running
   `scripts/append_improvement.sh` writes the note somewhere it will sit unmerged until that PR
   lands, and conflicts with the home branch when it does. So ask for friction (a wrong guardrail, a
   missing tool, an outdated doc) as a named section of the subagent's result, and have the
   controller log it with `scripts/append_improvement.sh <local|template|unsure> "<note>"` from the
   home branch at step 8.
   **If a dispatched subagent dies mid-task** (an infra error, a dropped connection, a rejected call
   that may have started anyway) **before re-dispatching, check for salvageable work first** —
   `git worktree list` for a worktree it may have created, and inspect it for uncommitted or
   unpushed commits. Re-dispatching blind risks either discarding real work or producing a silent
   duplicate of it. Only re-dispatch clean once you've confirmed there's nothing to recover.
5. **Gate:** run the task's verification commands; then `superpowers:requesting-code-review` (spec +
   code quality). At a deploy/milestone checkpoint, also run `/security-review`.

   **If the change touches the UI, two extra gates apply** (owner's call 2026-09-06, see
   `DECISIONS.md`):
   - **Look at it rendered.** Deploy it or run it, open the actual page, take a screenshot. Reading
     the diff is not looking at it. Three defects shipped on 2026-09-05 through a green suite and a
     code review, and every one was obvious in the first screenshot: a header printing "Log in"
     twice, the app's bottom nav on an auth screen, and every client-side route 404ing — which had
     silently made the invite email unopenable since #85.
   - **Get a UI/UX review** whose subject is the rendered screen, not the JSX: hierarchy, spacing,
     affordance, copy, accessibility, one-handed phone use. Hand it the screenshots.

   Both gates carry the owner's second constraint with them: **efficient, not overengineered.**
   Reuse the existing tokens and CSS classes; a review that comes back recommending a component
   library or a design-system layer for this app has answered the wrong question.
6. **PR:** open a PR referencing the Issue (`Closes #N`), then run
   `gh pr checks <PR> --watch --fail-fast` to block until CI finishes. **Right after any push** (new PR
   or a new commit on one already open), `--watch` can return a stale rollup for the *previous* commit
   if checks haven't registered yet server-side — confirm `gh pr view <PR> --json
   headRefOid,statusCheckRollup` shows the commit you just pushed before trusting a green result; if
   it's stale, wait and re-check rather than merging on faith. Once genuinely green: merge immediately
   (`gh pr merge <PR> --squash --delete-branch`), no further live approval needed. If checks exit
   non-zero, treat red CI as a hard stop — do not merge, fix and push again. **A clean code-review
   verdict from step 5 does not clear a red run here** — review reads the diff, it never executes it,
   so it cannot catch a failure that only exists at runtime in CI's actual environment. Real case,
   #124/PR #147 (2026-09-07): an independent review returned "ready to merge" on a diff that, once
   CI actually ran it, failed all 16 e2e tests identically (including pages the change never
   touched) — a Vite dev-server proxy config match too broadly and silently forwarded a new
   same-prefix module URL to a backend that isn't running in that job. Reproduce the failing check
   locally before assuming a red run is a flake or re-running it as-is; see `IMPROVEMENTS.md`
   2026-09-07 for the full diagnosis. Do not use `gh pr merge --auto` — it only waits for checks
   configured as *required* via branch protection, which may not
   exist (or, on a private repo on the free plan, may not even be available); without that, `--auto`
   merges immediately, before CI has even started.
   If the base branch moved since the PR opened and it now conflicts, resolve by hand — read both
   sides' intent, never blindly take one side or force through — then re-run local verification before
   pushing the merge commit.
7. **Write state back:** comment progress on the Issue; update `STATE.md`'s cursor/next-action only
   when on the orchestration home branch, never on a feature branch; append to `DECISIONS.md` if a
   decision was made. **Clear this tick's In-flight claim** (per "Claiming work" above) as part of
   this same write-back — a shipped or stopped tick must never leave a stale claim behind.
   **Any direct edit to `PLAYBOOK.md` or `GUARDRAILS.md` made mid-tick to correct something
   wrong** — not a new feature, an actual fix to a wrong instruction — **also gets an
   `append_improvement.sh` entry in the same commit**, `[template]` if the template's own copy of
   this file carries the same bug, `[local]` if it's specific to this repo's rendering of it. This
   is the step that was skipped when `blocked-by` tracking was fixed locally in one repo and the
   fix never reached the template — see `IMPROVEMENTS.md`'s log for the entry this rule would have
   produced, had it existed then.
   **`STATE.md` keeps no Tick log.** Write this tick's narrative entry straight to `HISTORY.md`,
   **prepended at the top** (newest first), verbatim — do not add it to `STATE.md` and roll it
   later. If a Needs-owner item this tick resolved, move it to `HISTORY.md` the same way rather
   than leaving a struck-through remnant in `STATE.md`. A "keep the last N ticks" rule regrows the
   same way a full tick log does, so keep none. `DECISIONS.md` is never rolled or summarized by
   this step.
   **Before committing, re-check `STATE.md`'s line budget stated at its own top** — Cursor and
   Needs-owner are the only sections that can grow it, so if either has, tighten it in the same
   commit rather than letting it ride.
   **Do not open a PR from the orchestration home branch to `main`.** If the repo has
   GitHub's "Automatically delete head branches" enabled — and it is worth enabling, it is the fix for
   stray merged branches piling up — then merging that PR *deletes the home branch*, even when merged
   deliberately without `--delete-branch`. Where that branch is also the tick claim mechanism, losing
   it silently disables collision protection for every later tick, and nothing fails loudly to tell
   you. Push orchestration doc commits **directly** to the home branch and leave it permanently
   unmerged; when `main` should carry them, cherry-pick those commits onto a
   short-lived branch and PR that instead. The home branch then never merges, so auto-delete can never
   reach it.
8. **Feedback review:** if this tick appended any `IMPROVEMENTS.md` entries, run
   `scripts/improvements_since_cursor.sh`, classify each (`[local]` → PR in this repo; `[template]` →
   PR against the template repo per GUARDRAILS "Cross-repo writes"; `[unsure]` → `STATE.md` → Needs
   owner), then run `scripts/advance_improvements_cursor.sh` with the new total entry count. Skip this
   step entirely if nothing new was logged this tick.
9. **Close the tick: report to the product owner, not to another engineer.** The summary's job is
   to let the owner form an opinion, so lead with what they can now *see and try*, and end with the
   feedback that would actually change what happens next. Owner's call, 2026-09-05: "I need to know
   what to see and try out to give you feedback next time. Not too brief but also not too verbose."

   Cover, in this order:
   - **What's live and what it does** — in product terms. "You can set a password from an emailed
     link and stay logged in", not "added POST /api/auth/set-password".
   - **What to try, concretely** — the URL, the screen, the exact steps. If it can't be tried yet,
     say so plainly and say what it's waiting on rather than implying it's usable.
   - **What changed that they'd notice** — including anything that looks different but isn't
     finished, so a half-built thing isn't reported as a bug.
   - **What I'd like feedback on** — the specific judgement calls where the owner's answer would
     change the next tick. Name them; don't fish.
   - **What's blocked on them**, if anything, and what it costs to leave it.

   Keep the engineering detail (commits, test counts, CI) to a line or two at the end — it's
   evidence the work is real, not the point of the summary. Issue comments and `STATE.md` are where
   the full record lives; do not restate them here. If the tick ends with something the owner couldn't already know about without
   checking — a new `intake`/`needs-clarification` question now waiting on them, a hard stop, or
   nothing left to do unattended — call `PushNotification` with a one-line summary. Skip it for routine
   ticks that ended cleanly with more `ready` work still queued; a notification for every tick is worse
   than none.

## The plan gate — decomposed, not big

A plan exists to turn an ask into an ordered sequence of testable steps. If that sequence already
exists, writing it out again costs a whole tick and delivers nothing. **Execute when all four hold:**

- the scope and the out-of-scope are written down (Issue body, or a spec it names);
- there is an ordered sequence of steps, each ending in something testable — a spec's
  "Implementation order" section counts, so does a scoped Issue body;
- the acceptance tests are named, not merely implied;
- no open question needs the owner.

Plan when any of those is missing — and plan the *missing* part, not the whole thing again.

Two failures this rule exists to prevent, both seen for real:

- **Planning what the spec already said.** #84 (2026-09-05) arrived approved, with a 315-line design
  spec carrying the schema DDL, endpoint list, config table, test list and an explicit
  "Implementation order" section, plus an Issue body enumerating scope, out-of-scope, constraints
  and tests. The old effort-size gate stopped the tick anyway and produced a 1091-line plan that
  largely restated the spec.
- **Executing something nobody has scoped.** The gate is not gone — it just keys on the right thing.

### Plan shape

A plan for an `effort:M` Issue should land around **200-300 lines**. What belongs in it:

- **task ordering** and the boundary of each task (files touched, what it produces for later tasks);
- **decisions the spec left open** — module placement, a library's work factor, where a value is
  computed — with the reasoning, since this is what a later tick would otherwise re-derive;
- **test case names**, so nothing is forgotten and coverage is reviewable at a glance;
- **verification steps that are easy to skip** and expensive to miss (a by-hand arm64 image build
  when CI never builds the Dockerfile, say).

What does not: **full test bodies and full implementation bodies.** Writing the change twice — once
as a plan, once as code — costs a tick, and handing an executor finished code to transcribe defeats
the red step of the TDD the plan is asking for. Give the test's *name and intent*; let the executor
write it and watch it fail. `2026-09-05-accounts-auth-core.md` is the reference shape (266 lines,
after being cut down from 1091); the four `2026-08-25-*` plans are the lean end for `effort:S` work.

### Linking a plan to its Issue

A plan is only "linked" if the Issue says so. When a plan merges, **add its path to the Issue body**
(a `**Plan:** docs/superpowers/plans/<file>.md` line) as well as commenting it. Step 3 reads the
Issue, so an unlinked plan is an invisible one — before this rule, no Issue in the repo referenced
its plan and the gate was deciding from a directory listing.

## Where the effort goes

A soft guideline for how a workstream's effort should divide, owner's call 2026-09-05:

| | share | |
|---|---|---|
| **Implementation** | ~60% | Get to running code early; reviews on real code beat reviews on prose. |
| **Planning** | ~30% | Decomposition and the decisions a spec left open. Not transcription. |
| **Review** | ~10% | Regularly, not only at the end. |

Deliberately soft. Research-heavy or genuinely novel work needs more investigation up front and
should take it; say so in `STATE.md` rather than quietly overrunning. Two things the split does not
mean: review is a **gate, not a budget line** — a review that finds something real costs whatever it
costs, and 10% is a floor on frequency, not a ceiling on depth. And verification (running the tests,
building the image) is part of implementation, not part of review.

## Model tiering for dispatched work

Owner's call, 2026-09-06: route dispatched work to a model tier — stronger for the expensive-to-
get-wrong work, cheaper for mechanical work — rather than every subagent running on whatever the
controller happens to be on. The `Agent` tool's per-dispatch `model` override (`opus`/`sonnet`/
`haiku`/`fable`) already does this; this section is the policy for when to use which.

**Stronger model:**
- Planning (`superpowers:writing-plans`, spec writing) — a bad plan is paid for by every task
  executed against it.
- Anything GUARDRAILS classifies as **destructive** — auth, session, secret or token handling;
  schema migrations.
- **Code review** — the last gate before merge. This repo has direct evidence a weak one is worse
  than none: on 2026-09-05 three defects shipped in the login path past a green suite *and* a code
  review, all three obvious in the first screenshot.

**Cheaper model:**
- Executing an `effort:S` ticket that arrives with a scoped file list and named tests — low
  ambiguity, cheap to redo if imperfect.

**Precedence: destructive beats effort size, always.** An `effort:S` ticket that touches auth,
sessions, secrets, tokens or a migration takes the stronger tier regardless of size — size is a
proxy for ambiguity, not for stakes, and where the two disagree stakes win. (#127, `bootstrap_
owner.py` missing from the image, is `effort:S` *and* sits on the account-creation path — the
stronger tier, not the cheaper one.)

**The dispatch default is pinned, not inherited** from whatever model the controller session
happens to be running interactively. The controller's model is a personal editing preference; the
dispatch default governs unattended, high-stakes work that can run on a schedule — coupling them
means changing an editor setting silently changes what runs the auth work at 3am. This repo has
been bitten twice by exactly that shape of implicit coupling: `docker compose up` resolving to
`:latest` downgraded production for 11 days (#126), and PLAYBOOK step 1 read `main`'s stale
orchestration docs for a while because it never named a branch. Explicit beats inherited: pin
`sonnet` as the dispatch default for the stronger tier and `haiku` for the cheaper tier, and revisit
against actual outcomes — if the cheap tier starts producing work the review gate catches, the tier
boundary is wrong, not the review.

**`model` is ignored for `subagent_type: "fork"`** — a fork always inherits the parent's model, so
this tiering only applies to the worktree-isolated dispatches Execute already uses.

## Budget & checkpointing
Track work against the GUARDRAILS per-tick token budget. When near the limit, finish the current
step, write `STATE.md`, and stop with a clean resume note rather than starting a new task.

## Lean rules (always)
- Prefer `git`/`gh`/grep over reading files. Read a file only when about to change it.
- One subagent per task with an explicit file list. Summarize subagent results into STATE; do not
  pull their full transcripts into the controller context.
