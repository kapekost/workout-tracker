# Orchestration Decisions

> Append-only log of owner decisions made during `/orchestrate` runs, so the runner never relitigates
> them. Newest at the top. Format: `## <date> — <short title>` then 1-3 sentences of the decision + why.

## 2026-08-26 — MCP server setup is per-project, owner-decided

Don't auto-create `.mcp.json` from `.mcp.json.example` or add MCP servers
speculatively. The owner decides which MCP servers (if any) a given
project actually needs, case by case. If a task seems to need one, ask
rather than guessing.
