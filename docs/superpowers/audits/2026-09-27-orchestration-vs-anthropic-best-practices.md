# Orchestration template vs. Anthropic best practices

Audit, 2026-09-27. Scope: `docs/orchestration/{PLAYBOOK,GUARDRAILS,DECISIONS}.md` in full, the
most recent `HISTORY.md` entries (2026-09-15 through 2026-09-27), and the
`superpowers:subagent-driven-development` / `superpowers:writing-plans` skill files in full
(`~/.claude/plugins/cache/claude-plugins-official/superpowers/6.4.1/skills/`), compared point by
point against Anthropic's own published guidance, fetched fresh rather than recalled from
training data. No code changed; this is a documents-only audit.

---

## Verdict

**This template lines up with Anthropic's published guidance closely — in several places it's a
more rigorous, evidence-backed implementation of a pattern Anthropic states only in the
abstract.** A large share of the alignment is inherited for free: the two Superpowers skills this
project runs on (`subagent-driven-development`, `writing-plans`) already encode most of
"Building Effective Agents" and "Effective context engineering for AI agents" as executable
process — fresh subagent per task, a compaction-surviving ledger, model tiering by task
complexity, a scoped task brief instead of a vague instruction. `PLAYBOOK.md`/`GUARDRAILS.md`/
`DECISIONS.md` are the project-specific layer built *on top of* that foundation: GitHub
Issues+Projects as the source of truth, a real collision-avoidance claim mechanism, a destructive-
operation approval chain, and — genuinely ahead of anything Anthropic publishes — a standing rule,
proven out by real incidents (#168, #152), to verify a subagent's or reviewer's own "looks clean"
claim against source before acting on it.

**The one clear, concrete, currently-mis-diagnosed gap**: this project's standing "PRs merge once
CI is green, no further live approval" policy runs directly against Claude Code's own auto-mode
classifier, which specifically and by design blocks a merge with no human approval under the
category `[Merge Without Review]`. The project has hit this at least eight separate times across
its history (#138, #180/181, a `DECISIONS.md` `Edit` block, #202, #212, #213, and others) and has
logged every occurrence as an `[unsure]`, "harness-level, not fixable via a PR here" mystery, with
"retry the identical command" as the standing workaround. It is not a mystery: Anthropic's own docs
name the exact, supported configuration fix, and this project has already discovered and applied
the identical fix for a structurally identical block (`[Production Deploy]`, via
`Bash(bash scripts/deploy.sh)` in `.claude/settings.local.json`) — it was just never generalized to
`gh pr merge`. See §5 and the first recommended follow-up below.

Everything else is either a faithful match to published guidance, a reasonable and explicitly
reasoned adaptation to a single-owner personal project (vs. the team/org context most of
Anthropic's guidance assumes), or a genuinely novel addition Anthropic doesn't cover at all
(the GitHub-Projects-as-board / tick-claiming mechanism).

---

## Sources consulted

- [Building Effective AI Agents](https://www.anthropic.com/engineering/building-effective-agents) — Anthropic, engineering blog
- [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) — Anthropic Applied AI team, 2025-09-29
- [How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) — Anthropic engineering blog
- [When to use multi-agent systems (and when not to)](https://claude.com/blog/building-multi-agent-systems-when-and-how-to-use-them) — Claude blog, 2026-07-10
- [Best practices for Claude Code](https://code.claude.com/docs/en/best-practices) — official Claude Code docs
- [How we built Claude Code auto mode](https://www.anthropic.com/engineering/claude-code-auto-mode) — Anthropic engineering blog
- [Choose a permission mode](https://code.claude.com/docs/en/permission-modes) — official Claude Code docs
- [Configure auto mode](https://code.claude.com/docs/en/auto-mode-config) — official Claude Code docs
- `superpowers:subagent-driven-development` and `superpowers:writing-plans` SKILL.md files (bundled Claude Code plugin, `claude-plugins-official` marketplace) — not Anthropic's own prose, but the mechanism this project runs execution through, so treated as load-bearing "current practice" alongside the essays above.

---

## Point-by-point comparison

### 1. Fresh subagent per task, isolated context

**Template.** `PLAYBOOK.md` step 4 dispatches "one subagent per task; it reads only the Issue +
its plan doc + the named files, never the whole tree." `subagent-driven-development`'s `SKILL.md`
is explicit about why: "You delegate tasks to specialized agents with isolated context... They
should never inherit your session's context or history — you construct exactly what they need."
Each dispatch gets a generated `task-brief` (exact values, verbatim) rather than a restated
history, and the skill calls out the failure mode directly: "a real session's dispatch hit 42k
chars of which 99% was pasted history."

**Anthropic.** Matches on every count. The context-engineering post: "specialized sub-agents can
handle focused tasks with clean context windows... each subagent might explore extensively... but
returns only a condensed, distilled summary of its work (often 1,000-2,000 tokens)." The
multi-agent research post is more specific about *why* vague dispatches fail, from direct
experience: "We started by allowing the lead agent to give simple, short instructions like
'research the semiconductor shortage,' but found these instructions often were vague enough that
subagents misinterpreted the task or performed the exact same searches," and generally, "Each
subagent needs an objective, an output format, guidance on the tools and sources to use, and clear
task boundaries. Without detailed task descriptions, agents duplicate work, leave gaps, or fail to
find necessary information." `PLAYBOOK.md`'s "hand the subagent the main checkout's absolute
interpreter path, or tell it to install first" and the task-brief mechanism are exactly this
guidance operationalized.

**Verdict: aligned, no gap.** The one thing worth naming: this alignment is mostly Superpowers'
doing, not something `PLAYBOOK.md`/`GUARDRAILS.md` invented — the template's own contribution here
is layering worktree-isolation discipline on top (`PLAYBOOK.md`'s repeated warnings about a
shared-checkout `git checkout` silently switching branches out from under a concurrent tick,
IMPROVEMENTS.md 2026-08-31 and 2026-09-15), which Anthropic's guidance doesn't address at all —
Anthropic's docs assume subagent isolation is a context-window property, not a filesystem
property. That's a real, hard-won addition specific to running multiple *concurrent* Claude
sessions against one git repo, a scenario neither cited Anthropic doc discusses.

### 2. Ledger/todo-based recovery from context compaction

**Template.** `subagent-driven-development`'s setup section: "Conversation memory does not survive
compaction. In real sessions, controllers that lost their place have re-dispatched entire
completed task sequences — the single most expensive failure observed. Track progress in a ledger
file, not only in todos... The ledger is your recovery map: the commits it names exist in git even
when your context no longer remembers creating them. After compaction, trust the ledger and
`git log` over your own recollection." At the orchestration layer, `PLAYBOOK.md`'s "Claiming
work" section does the same thing for surviving a *process* restart, not just a context
compaction: a pushed `In-flight` claim on the home branch is the recovery point if the whole
session dies.

**Anthropic.** Direct match to the context-engineering post's "structured note-taking" technique:
"the agent regularly writes notes persisted to memory outside of the context window. These notes
get pulled back into the context window at later times... After context resets, the agent reads
its own notes and continues multi-hour training sequences." Also matches the "compaction" section:
"taking a conversation nearing the context window limit, summarizing its contents, and
reinitiating a new context window with the summary... enabling the agent to continue with minimal
performance degradation."

**Verdict: aligned, with one real nuance worth flagging, not fixing.** Anthropic's note-taking
pattern assumes the notes get *read back* later. This project's `HISTORY.md` explicitly does not:
its own header says "**No tick reads this file**... Read this when you need to know *why*
something was done a particular way... Otherwise you don't need this file." `STATE.md`'s hand-
curated "Cursor" section is the only thing every tick actually reloads. This is a deliberate,
reasoned design (an append-only log that *did* get reloaded every tick would blow through the
150k-token budget almost immediately, and `STATE.md` hit exactly that problem once already —
1067 lines on 2026-09-06 before the split), but it is a narrower memory model than Anthropic's:
if `STATE.md`'s Cursor ever drops something load-bearing, that fact is still recoverable via git
log or a manual `HISTORY.md` grep, but nothing in the automated tick loop will do that grep for
you. Worth naming as a conscious tradeoff, not a bug.

### 3. Two-stage review (spec compliance + code quality) per task, plus one final whole-branch review

**Template.** `PLAYBOOK.md` step 5 + `subagent-driven-development`'s task loop: every task gets a
fresh implementer, then a fresh task reviewer checking "spec compliance AND task quality," both
required — "Never skip the task review, and never accept a report missing either verdict... 
Implementer self-review never replaces the task review; both are needed." A final whole-branch
review runs once, on the strongest available model, after all tasks land. On top of this,
`PLAYBOOK.md`'s owner-mandated UI gate (`DECISIONS.md` 2026-09-06, refined 2026-09-14) adds a
*third* review axis for anything touching the UI — a UI-expert pass and a separate UX-expert pass,
both against a live screenshot, not the diff.

**Anthropic.** The "verification subagent" pattern from the multi-agent-systems post: "One
multi-agent pattern that consistently works well across domains is the verification subagent. This
is a dedicated agent whose sole responsibility is testing or validating the main agent's work,"
paired with a named failure mode that maps almost exactly onto this project's own incident log (see
§6): "The most significant failure mode for verification subagents is marking outputs as passing
without thorough testing... the instruction 'You MUST run the complete test suite before marking as
passed' is essential." The official Claude Code best-practices doc frames the same idea as an
"adversarial review step": "A reviewer running in a fresh subagent context sees only the diff and
the criteria you give it, not the reasoning that produced the change, so it evaluates the result on
its own terms," and separately warns against the opposite failure — chasing every finding: "A
reviewer prompted to find gaps will usually report some, even when the work is sound... Chasing
every finding leads to over-engineering."

**Verdict: aligned, and the UI/UX split plus "verify screenshots against source" rule exceeds what
Anthropic publishes.** Nothing in Anthropic's own material distinguishes a visual-design reviewer
from a usability reviewer, or names screenshot-based review's specific blind spot (a JPEG can't
show source, an unrendered confirm-state, or which feature a glyph belongs to) the way this
project's `DECISIONS.md` 2026-09-14 entry and the #152 incident do. This is the template doing
real, evidenced work Anthropic's guidance only gestures at generically.

### 4. Model tiering by task complexity

**Template.** `PLAYBOOK.md` "Model tiering for dispatched work" (owner's call, 2026-09-06): route
planning, destructive-adjacent work, and final code review to the stronger tier; route
low-ambiguity, well-scoped `effort:S` execution to the cheaper tier; "destructive beats effort size,
always"; the dispatch default is **pinned** in `PLAYBOOK.md` rather than inherited from whatever
model the controller happens to be running interactively, explicitly because two prior incidents
(#126's `docker compose :latest`, and step 1 silently reading `main`'s stale docs) were both "it
inherits something sensible until it isn't."

**Anthropic.** `subagent-driven-development`'s own "Model Selection" section says the identical
thing almost word for word: "Use the least powerful model that can handle each role... Always
specify the model explicitly when dispatching a subagent. An omitted model inherits your session's
model — often the most capable and most expensive — which silently defeats this section," plus a
sharper cost note the template doesn't currently reflect: "Turn count beats token price... the
cheapest models routinely take 2-3× the turns on multi-step work — costing more overall... Use a
mid-tier model as the floor for reviewers and for implementers working from prose descriptions,"
reserving the cheapest tier specifically for when "the task's plan text contains the complete code
to write" (transcription, not judgment).

**Verdict: aligned in principle; one place the template is coarser than the skill it runs on.**
`PLAYBOOK.md`'s tiering is binary (stronger / cheaper) and keyed mostly to *risk* (destructive vs.
not). The skill it dispatches through recommends a three-tier judgment keyed to *task shape*
(mechanical/transcription → cheapest; integration/multi-file → mid-tier; architecture/design →
strongest) and warns explicitly that the cheapest tier applied to a "prose description" task can
cost *more* overall in wall-clock/turns than a mid-tier model would have, not just risk lower
quality. `PLAYBOOK.md`'s own model-tiering section pins `haiku` as the cheap-tier default for any
`effort:S` ticket "that arrives with a scoped file list and named tests" — which is close to but
not identical to Superpowers' narrower carve-out ("the plan text contains the complete code to
write"). Worth a small reconciliation pass, not urgent — see follow-ups.

### 5. Destructive-operation approval gate — and its collision with Claude Code's own auto-mode classifier

**Template.** `GUARDRAILS.md`'s chain of authority is unusually well-specified: an enumerated
destructive-operation list, a standing-approval mechanism for a pre-approved spec's child Issues,
an "always needs a fresh human approval" carve-out that no standing approval can cover (schema
loss, >10 file deletes, history rewrite/force-push, secrets, public exposure), and one rule with
"no unattended-execution exception" at all — approval-label-adding is human-only, full stop.
Separately, `GUARDRAILS.md`/`PLAYBOOK.md` also carry a **standing merge policy**: "PRs merge once
CI is green, with no further live approval per PR... This is a standing owner decision... not
something re-asked each time" (`DECISIONS.md` 2026-08-30).

**Anthropic.** "Building Effective Agents" states the underlying principle only in the abstract:
"The autonomous nature of agents means higher costs, and the potential for compounding errors. We
recommend extensive testing in sandboxed environments, along with the appropriate guardrails,"
with agents "pausing for human feedback at blockers." `GUARDRAILS.md` is a genuine, concrete
instantiation of that abstract advice — arguably better specified than anything Anthropic itself
publishes on the topic.

Separately, and this is the one place the comparison surfaces a live, currently-mishandled
conflict: Claude Code's own **auto-mode classifier** is a first-party Anthropic safety mechanism
that independently, deliberately blocks exactly the pattern this project's merge policy asks for.
[Choose a permission mode](https://code.claude.com/docs/en/permission-modes) documents the
category directly: a merge "the model starts itself, with no human approving that command, falls
under `[Merge Without Review]`," and clearing it takes either the user's own message "nam[ing] the
action and the specific thing that makes it dangerous" for that one instance, or — for a standing
policy like this project's — "add it to `autoMode.allow`." The same doc's "Repeated blocks" section
says plainly: "Repeated blocks usually mean the classifier is missing context about your
infrastructure. Use `/feedback` to report false positives, or have an administrator configure
trusted infrastructure" — not "retry it."

This project has hit exactly this block at least eight times (`IMPROVEMENTS.md` 2026-09-13/2026-09-
14 entries; `HISTORY.md` entries for #138, #180/181, #202, #212, #213) and every single time has
logged it as `[unsure]`, "harness-level... not fixable via a PR here," concluding the fix is
"retry the identical command" or "hand the merge command to the owner." That conclusion is stale:
Anthropic's docs describe a supported, permanent fix, and — notably — this project has *already
found and applied* the identical class of fix for a different recurring block. `DECISIONS.md`
2026-09-14 records exactly this: the deploy classifier ("Production Deploy") was silenced by adding
`Bash(bash scripts/deploy.sh)` to `.claude/settings.local.json`'s `permissions.allow` list — a
narrow Bash allow-rule, which [Configure auto mode](https://code.claude.com/docs/en/auto-mode-config)
confirms "stay[s] in effect in auto mode" and is "resolved before the classifier runs." The same
mechanism (`Bash(gh pr merge *)` in the same gitignored, machine-local file) would very likely
close the merge block the same way, but it was never tried — the deploy fix and the first `gh pr
merge` block sit one paragraph apart in the same `DECISIONS.md` entry, and the connection was never
made.

**Verdict: this is a real, currently-misdiagnosed gap, not a deliberate divergence.** The project's
merge-without-live-approval *policy* is reasonable and well-reasoned for a single-owner project
(see `DECISIONS.md` 2026-08-26/2026-08-30); the problem is that the policy was never actually
registered with the tool that enforces a competing default. See follow-up #1.

### 6. "Verify a subagent's claim against source before acting on it"

**Template.** This is the single most battle-tested rule in the project's own history, restated
and cross-referenced at least four times across `PLAYBOOK.md`/`IMPROVEMENTS.md`/`HISTORY.md`: the
#168 incident (a subagent's "grep came back clean" claim missed one live production hit), the #152
incident (two full UI/UX review passes returned confident Critical findings that were flatly wrong
against source — a different feature, a contradicted SVG, a text label the reviewer's own
screenshot didn't happen to capture), and the #213/#214 incident (a stale `reviews: []` check
treated as permanent clearance let a real Codex finding sit unread for 4.5 hours). `PLAYBOOK.md`
step 5 and step 6 both now carry explicit language requiring a fresh, immediate re-check rather
than trusting an earlier snapshot.

**Anthropic.** The official best-practices doc states the general principle: "Have Claude show
evidence rather than asserting success: the test output, the command it ran and what it returned,
or a screenshot of the result. Reviewing evidence is faster than re-running the verification
yourself." The multi-agent-systems post names the specific verification-subagent failure mode:
"marking outputs as passing without thorough testing." Neither goes further than that.

**Verdict: this project exceeds Anthropic's published guidance here, clearly and with evidence.**
Anthropic's material states the principle once, generically. This project has independently
rediscovered it three separate times against three different failure shapes (a grep classification
error, a vision-model hallucination against SVG source, a stale point-in-time check treated as
permanent) and has, each time, actually changed the process document rather than just noting the
incident. This is the strongest single piece of evidence in the whole review that the template's
authors are engineering a real process, not cargo-culting one.

### 7. `STATE.md`-stays-small / `HISTORY.md`-append-only context-budget split

**Template.** `STATE.md` states its own budget ("Hard budget: ~250 lines... every tick reads this
file first, so its cost is per-tick and compounding") and keeps no tick log at all — every tick's
narrative goes straight to `HISTORY.md`, "prepended at the top... verbatim," with the explicit
rationale that "a 'keep the last N' rule regrows the same way" as the original 1067-line blowout,
"so keep none."

**Anthropic.** Not a pattern Anthropic names as such, but it is the direct, correct application of
the context-engineering post's overarching principle: find "the smallest set of high-signal tokens
that maximize the likelihood of some desired outcome," applied here as a hard split between
frequently-reloaded working state and a write-once archive nothing reloads. It's also consistent
with the official best-practices doc's `/clear`-between-tasks advice ("Long sessions with
irrelevant context can reduce performance") generalized from a single session to a recurring
multi-day tick loop.

**Verdict: aligned, well-executed, no gap** beyond the one already noted in §2 (the archive is
genuinely unreachable to an automated tick, which is a deliberate cost of keeping the reloaded
file small).

### 8. GitHub Issues+Projects as source of truth, and the tick-claiming collision mechanism

**Template.** `PLAYBOOK.md`'s whole "Claiming work" section — a pushed, timestamped `In-flight`
claim to the home branch the instant an Issue is picked, enforced by git's own non-fast-forward
rejection, not cooperative reading — exists because of a real, once-suffered concurrent-tick
collision (`DECISIONS.md` 2026-08-30).

**Anthropic.** Not covered. Anthropic's multi-agent guidance (both the research-system post and
the multi-agent-systems post) is about *one* controller fanning work out to subagents it dispatches
and owns; none of the cited material addresses two independent, uncoordinated Claude Code sessions
racing to pick up the *same* externally-tracked work item, which is this project's actual
concurrency risk (a scheduled routine plus a live session, or two routines).

**Verdict: a genuinely novel, well-engineered addition, outside Anthropic's published scope.** No
finding to make here beyond noting it — this is the template solving a real problem Anthropic's
material simply doesn't address, correctly.

### 9. "Continuous execution, don't stop to ask" vs. this project's merge override

Worth naming as its own point because it sharpens §5. `subagent-driven-development`'s own default
posture is aggressively autonomous — "Do not pause to check in with your human partner between
tasks... 'Should I continue?' prompts... waste their time" — but it names exactly four things that
still stop it, and one of the four is explicitly "a side effect outside this worktree that norms
say you ask about first (**a merge**, a push to a shared branch, a publish)." This project's
`GUARDRAILS.md`/`DECISIONS.md` deliberately override that specific default for merges (not the
other three) with a reasoned, owner-made call. That's a legitimate project-level override of a
skill default — but it means the project is now swimming against *two* independent pieces of
Anthropic-side guidance/product pointed the same direction (the skill's own default stop condition,
and the auto-mode classifier's `[Merge Without Review]` category), and has only formally overridden
one of them (by editing `PLAYBOOK.md`/`DECISIONS.md`) while treating the other as unexplained
friction to route around by hand each time. Registering the override with the classifier (§5,
follow-up #1) closes this cleanly and consistently with how the override was already made at the
policy-doc layer.

---

## Recommended follow-ups

Audit-only — nothing below was implemented as part of this pass. Ordered by priority; each is
small enough to be its own single task.

1. **P0 — Register the standing merge policy with the auto-mode classifier.** Add
   `"Bash(gh pr merge *)"` to `permissions.allow` in `.claude/settings.local.json` (the same
   gitignored, machine-local file, same mechanism already proven for
   `Bash(bash scripts/deploy.sh)` per `DECISIONS.md` 2026-09-14). This is the single most-repeated
   piece of process friction in the project's entire history (at least 8 logged occurrences) and
   has a documented, supported fix — see [Configure auto mode](https://code.claude.com/docs/en/auto-mode-config#add-a-human-checkpoint)
   and [Choose a permission mode](https://code.claude.com/docs/en/permission-modes#when-auto-mode-falls-back).
   If a narrow Bash rule turns out not to fully suppress the classifier for this command shape,
   fall back to an `autoMode.allow` prose entry in `~/.claude/settings.json` (user-scope only —
   the docs are explicit that `autoMode` blocks in project-level `.claude/settings.local.json` are
   not read). Either way, retire the "[unsure] harness-level, not fixable" framing in
   `IMPROVEMENTS.md`/`STATE.md`'s Needs-owner section for this specific item once verified against
   a real merge.

2. **P1 — Reconcile `PLAYBOOK.md`'s binary model-tiering with Superpowers' three-tier guidance.**
   `subagent-driven-development`'s "Turn count beats token price" warning (cheapest-tier models can
   cost *more* overall on prose-description tasks due to extra turns) isn't reflected in
   `PLAYBOOK.md`'s current `effort:S`-with-a-file-list carve-out for `haiku`. A short pass checking
   whether this project's own `haiku`-tier dispatches have shown that turn-count cost (grep
   `HISTORY.md`/`IMPROVEMENTS.md` for haiku-dispatch task counts) would settle whether the current
   carve-out needs narrowing to "plan text contains the complete code" specifically.

3. **P2 — Decide, and write down, whether `HISTORY.md` needs an occasional forced read.** The
   append-only archive is currently invisible to every automated tick by design (§2). That's a
   reasonable tradeoff, but it's currently implicit rather than a decision — worth one
   `DECISIONS.md` line either confirming "never re-read, git/grep is the recovery path if
   `STATE.md`'s Cursor ever drops something" as the deliberate final answer, or adding a cheap
   periodic nudge (e.g., every N ticks, grep `HISTORY.md` for open `Needs owner`-adjacent threads
   that `STATE.md`'s Cursor might have silently dropped).

4. **P3 — Point `PLAYBOOK.md`/`GUARDRAILS.md` at this audit's §5 finding directly**, since it
   corrects a standing (wrong) conclusion recorded in `IMPROVEMENTS.md` across three separate
   entries (2026-09-13 ×2, 2026-09-14). Once follow-up #1 is verified working, those entries should
   be marked resolved rather than left as open `[unsure]` items — they are the same root cause,
   now diagnosed.
