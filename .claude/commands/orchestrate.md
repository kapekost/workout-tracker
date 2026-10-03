---
description: Run one tick of the project orchestrator (or status/approve/plan/stop/review-feedback).
argument-hint: "[status | plan <issue-number> | review-feedback | stop]"
allowed-tools: Bash, Read, Edit, Write, Grep, Glob, Agent, Skill
---

> **The category-level `allowed-tools` above is deliberate, not an oversight.**
> Owner decision, 2026-10-03: the orchestrator runs autonomously, including
> unattended on a schedule. Granting whole tool *categories* is what makes that
> possible — pattern-scoped grants would put every routine command back in front
> of a permission classifier, which is exactly the friction that produced the
> "retry a bare denial" rule.
>
> **The boundary is `.claude/settings.json`'s `deny` list, not this frontmatter.**
> That list is small and deliberately so: secrets, `~/.ssh`, `AGENTS.local.md`,
> `./data`, force-push, hard reset, `clean -f`, `rm -rf`, `gh release`,
> `docker system prune`, and `curl` against `/api/import` or `/api/auth`.
> Everything else is the agent's to use without asking.
>
> **Do not "tidy" this by narrowing `allowed-tools`.** That trade buys friction,
> not safety, and the friction lands on the owner. If the boundary needs to
> change, change the deny list — and say why in `DECISIONS.md`.
>
> **One known conflict you must know about.** The deny list contains
> `Bash(gh issue edit *--add-label approved*)`, because "approval is human-only"
> is the single rule `GUARDRAILS.md` says no flag overrides. But a deny rule is
> enforced by mechanism, not by actor — it cannot tell a human typing `/approve`
> from the agent running the same command. So **the `approve` variant below will
> be blocked by the deny list.** Until that is resolved, the owner's manual
> approval path is `gh issue edit <issue-number> --add-label approved` run
> directly, not through `/orchestrate approve`.

You are the Workout Tracker orchestration controller. Drive work per the playbook.

**Load these first (docs only — do not read source yet):**
- `docs/orchestration/PLAYBOOK.md` — the tick algorithm and command variants.
- `docs/orchestration/GUARDRAILS.md` — the policy you MUST obey (it wins on conflict).
- `docs/orchestration/STATE.md` — the live cursor; resume from here.
- `docs/orchestration/DECISIONS.md` — owner decisions; do not relitigate.

**Argument:** $ARGUMENTS

Dispatch per PLAYBOOK "Command variants":
- empty → run one full tick.
- `status` → run `scripts/orchestrate_status.sh` and print its output verbatim. No writes, no
  code changes. See `PLAYBOOK.md`'s "Status report" section for the exact format and sources.
- `approve <issue-number>` → **UNREACHABLE as of 2026-10-03, deliberately.** The deny
  list contains `Bash(gh issue edit *--add-label approved*)`, and a deny rule is
  enforced by mechanism rather than by actor — it cannot tell a human typing
  `/approve` from the agent running the same command. The only way to keep
  "approval is human-only" structural rather than prose is for the owner to never
  be inside this harness when approving.
  **So: the owner adds the label from their own terminal, not through here.**
  If you are running unattended and receive this argument, or find yourself about
  to add `approved` for any other reason, stop and report instead — see
  GUARDRAILS "Approval is human-only".
- `plan <issue-number>` → write the detailed plan via the writing-plans skill, then stop.
- `review-feedback` → run only PLAYBOOK step 8 (feedback review), then stop.
- `stop` → set STATE.md Stop-condition to "owner stop", commit, stop.

Honor the lean contract: reload docs not the repo, dispatch one subagent per task with a scoped file
list, checkpoint at task/context-budget boundaries per GUARDRAILS "Task sizing", and never auto-merge
to `main`. Finish by writing STATE.md and printing a one-screen summary (position, what
you did, next action, anything needing the owner).
