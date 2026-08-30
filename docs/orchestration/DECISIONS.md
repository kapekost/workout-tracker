# Orchestration Decisions

> Append-only log of owner decisions made during `/orchestrate` runs, so the runner never relitigates
> them. Newest at the top. Format: `## <date> — <short title>` then 1-3 sentences of the decision + why.

## 2026-08-30 — Sequencing: ready work proceeds independently of intake triage

`PLAYBOOK.md` step 3's literal old text ("any `intake` Issue preempts all `ready` work") is
superseded: intake triage and `ready`-issue execution are separate, non-blocking tracks. An
untriaged `intake` Issue does not gate an `/orchestrate` tick from picking the highest-ranked
`ready` Issue instead — matches actual practice since 2026-08-26 (#24/#35/#38 shipped while
#27/#29/#30/#32/#33 sat untriaged across several ticks). `PLAYBOOK.md` step 3 reworded to match.
Owner call, prompted by the runner flagging the discrepancy in `STATE.md` rather than silently
picking a reading on its own.

## 2026-08-30 — Merge policy: agent watches CI itself, then merges — no live per-PR ask

Propagated from `agent-scaffold` via `copier update`. After opening a PR: watch CI to
completion (`gh pr checks --watch --fail-fast`) and merge immediately if green — no live
"can I merge this?" per PR. Explicitly not GitHub-native `gh pr merge --auto`: verified
empirically that without branch protection defining required checks, `--auto` merges
immediately regardless of CI state. See `docs/superpowers/specs/2026-08-26-human-agent-collaboration-design.md`
in `agent-scaffold` for the full design.

## 2026-08-26 — MCP server setup is per-project, owner-decided

Don't auto-create `.mcp.json` from `.mcp.json.example` or add MCP servers
speculatively. The owner decides which MCP servers (if any) a given
project actually needs, case by case. If a task seems to need one, ask
rather than guessing.
