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

## Feature intake (product owner → Issues)

A high-level feature request from the product owner — in conversation, not yet an Issue — does not
go straight to code, and does not get invented scope on their behalf.

1. **Ask clarifying questions** to shape it: the actual user-facing outcome, what's explicitly out
   of scope, constraints, rough priority. Do not guess at intent — the same "never guess" principle
   GUARDRAILS applies to destructive-op approval applies here to scope.
2. **Capture the raw ask as a single Issue labeled `intake`** before attempting full decomposition —
   even a rough capture beats losing the ask to context. `intake` means "not triaged at all yet";
   it is a different state from `needs-clarification` ("was triaged and failed" — see the Triage /
   INVEST gate below). Neither is `ready`.
3. **Run it through the Triage / INVEST gate.** If it's small enough as one Issue, relabel `intake` →
   `ready` (or `needs-clarification` if it still doesn't pass) directly. If it needs splitting, open
   properly-scoped child Issues (type/priority/effort labeled, INVEST-checked, referencing the
   `intake` Issue), add them to the Project board ranked, then close the `intake` Issue with a
   pointer to its children. **A third outcome**: owner Q&A can shape real direction — what to build,
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
- `/orchestrate status` — reconstruct + report only. **No execution, no writes.** Cheapest path.
- `/orchestrate approve <issue-number>` — **human-only**, never dispatched by an unattended tick (see
  GUARDRAILS "Approval is human-only"). When a human runs it: add the `approved` label to the given
  Issue, comment why, stop.
- `/orchestrate plan <issue-number>` — write the detailed plan for an Issue lacking one, via
  `superpowers:writing-plans`, then stop.
- `/orchestrate review-feedback` — run only step 8 below (feedback review), then stop. Also runs
  automatically at the end of any tick that logged a new `IMPROVEMENTS.md` entry.
- `/orchestrate stop` — set `STATE.md` → Stop-condition to "owner stop", commit, stop.

## Triage / INVEST gate
Before an Issue gets the `ready` label, it must pass a basic INVEST sanity check (Independent,
Negotiable, Valuable, Estimable, Small, Testable — see the `feature` issue form). If it clearly
fails — too vague, too large for its stated effort, or not independently actionable — label it
`needs-clarification` instead of `ready` and stop; do not guess at intent. An Issue arriving via
Feature intake starts labeled `intake`, not `needs-clarification` — see that section above for the
distinction.

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
2. **Reconcile reality:** `git status`, `gh pr list`, `gh issue list --label ready --state open`
   (sorted by the Project's manual rank). If reality diverged from `STATE.md`, correct `STATE.md` and
   continue. Also check for new owner comments since the last tick on any Issue currently in
   progress, or any `intake`/`needs-clarification` Issue awaiting an answer
   (`gh issue view <n> --comments`, or `gh api` filtered by date if scripting it across many Issues) —
   respond to them (answer, incorporate the feedback, or act on it) before picking the next action.
   A comment sitting unanswered across a tick boundary is a bug in the loop, not something to defer.
   **Also check the live In-flight claim per "Claiming work" above** — this is a separate check from
   `gh pr list` and catches what that can't (work in progress that hasn't reached a PR yet).
3. **Pick the next action.** Intake triage and `ready`-issue execution are independent, non-blocking
   tracks — an untriaged `intake` Issue does not block picking a `ready` Issue this tick
   (`DECISIONS.md` 2026-08-30 "Sequencing"). Pick the highest-ranked open Issue with the `ready`
   label, not carrying the `blocked` label; if none exists but `intake` Issues are waiting,
   resolve the highest-ranked one via the Feature intake flow above instead. **The moment an Issue
   is picked, push its claim per "Claiming work" above — before any of the branches below, before
   any execution.** Then:
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
   reads only the Issue + its plan doc + the named files, never the whole tree. If context bloats
   mid-task per GUARDRAILS, checkpoint and hand off to a fresh subagent rather than pushing through.
   Dispatch with worktree isolation whenever the subagent does its own branch/commit work, and
   remember what a fresh worktree does *not* have: `backend/.venv` and `frontend/node_modules` are
   gitignored and are not shared with the main checkout (`AGENTS.md` says so under Setup). Hand the
   subagent the main checkout's absolute interpreter path, or tell it to install first — otherwise
   its verification commands fail for reasons that have nothing to do with the change it made.
   **Friction goes in the subagent's final report, not into `IMPROVEMENTS.md` directly.** The
   improvements log and its `last-reviewed-count` cursor belong to the home branch — that is where
   every tick appends and where step 8 reads from. A subagent on a feature branch running
   `scripts/append_improvement.sh` writes the note somewhere it will sit unmerged until that PR
   lands, and conflicts with the home branch when it does. So ask for friction (a wrong guardrail, a
   missing tool, an outdated doc) as a named section of the subagent's result, and have the
   controller log it with `scripts/append_improvement.sh <local|template|unsure> "<note>"` from the
   home branch at step 8.
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
   non-zero, treat red CI as a hard stop — do not merge, fix and push again. Do not use `gh pr merge
   --auto` — it only waits for checks configured as *required* via branch protection, which may not
   exist (or, on a private repo on the free plan, may not even be available); without that, `--auto`
   merges immediately, before CI has even started.
   If the base branch moved since the PR opened and it now conflicts, resolve by hand — read both
   sides' intent, never blindly take one side or force through — then re-run local verification before
   pushing the merge commit.
7. **Write state back:** comment progress on the Issue; update `STATE.md`'s Cursor (Current
   focus/Next action) only when on the orchestration home branch, never on a feature branch;
   append to `DECISIONS.md` if a decision was made. **Clear this tick's In-flight claim** (per
   "Claiming work" above) as part of this same write-back — a shipped or stopped tick must never
   leave a stale claim behind.
   **`STATE.md` keeps no Tick log.** Write this tick's narrative entry straight to `HISTORY.md`,
   **prepended at the top** (newest first), verbatim — do not add it to `STATE.md` and roll it
   later. If a Needs-owner item this tick resolved, move it to `HISTORY.md` the same way rather
   than leaving a struck-through remnant in `STATE.md`. This file reached 1067 lines on 2026-09-06
   (~200 lines/day of tick-log growth) before a first split fixed it — a "keep the last N" rule
   regrows the same way, so keep none. `DECISIONS.md` is never rolled or summarized by this step.
   **Before committing, re-check `STATE.md`'s line budget stated at its own top** — Cursor and
   Needs-owner are the only sections that can grow it, so if either has, tighten it in the same
   commit rather than letting it ride.
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

## Budget & checkpointing
Track work against the GUARDRAILS per-tick token budget. When near the limit, finish the current
step, write `STATE.md`, and stop with a clean resume note rather than starting a new task.

## Lean rules (always)
- Prefer `git`/`gh`/grep over reading files. Read a file only when about to change it.
- One subagent per task with an explicit file list. Summarize subagent results into STATE; do not
  pull their full transcripts into the controller context.
