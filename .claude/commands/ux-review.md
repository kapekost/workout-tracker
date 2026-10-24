---
description: UX review. Recommend a design for a new feature, gate a built UI change, or run a full multi-expert review that decides Keep / Refine / Redesign.
argument-hint: "feature <issue> | change <PR> | full"
allowed-tools: Bash, Read, Write, Edit, Grep, Glob, Agent
---

You run a UX review of the Gym Tracker. The six expert agents are `.claude/agents/ux-*.md`; their
shared rules and output shape are in `docs/ux/REVIEW-CONTRACT.md`. Read the contract before you
dispatch. You are the controller: you dispatch, verify and decide. The experts only report.

**Argument:** $ARGUMENTS

## Experts

| Agent | Angle | Runs in |
|---|---|---|
| `ux-flow` | Usability: flow, IA, affordance, copy, feedback (the PLAYBOOK "UX-expert") | feature, change, full |
| `ux-visual` | Visual design against the shipped tokens (the PLAYBOOK "UI-expert") | feature, change, full |
| `ux-a11y` | WCAG 2.2 AA | change if new controls or colors; full |
| `ux-trust` | Health-data trust and privacy | feature or change touching accounts, sharing, export, AI, analytics; full |
| `ux-product` | Onboarding, activation, retention, what to build or cut | feature if it adds a screen; full |
| `ux-mobile` | PWA and native conventions, port to the RN app | feature or change touching timer, gestures, offline, nav; full |

Dispatch every expert in **one message** (parallel), each with `model: "sonnet"` (pinned per
PLAYBOOK "Model tiering"; the experts are read-only and their output is verified). Each prompt
names: the scope, the screens directory, the files or issue in scope, and "follow
docs/ux/REVIEW-CONTRACT.md". Do the synthesis yourself.

## `feature <issue>`: before it is built

1. `gh issue view <issue>` and read any linked spec. No screens yet: capture the current screens
   the feature will change (`scripts/ux_capture.sh`) so experts judge against what exists.
2. Dispatch `ux-flow`, `ux-visual` and any others the table selects.
3. Merge into one recommendation: the screens touched, the proposed interaction (steps, states:
   empty, loading, error, offline), copy, which existing tokens and classes it reuses, risks, and
   UI acceptance criteria the PR must meet. Under 400 words.
4. Post it as one comment on the issue (`gh issue comment`). It is advice; the owner's approval
   label still governs whether the work starts.

## `change <PR>`: after it is built (PLAYBOOK step 5 UI gate)

1. Check out the PR branch in its worktree, run `scripts/ux_capture.sh`, and capture any state the
   change adds that the script does not reach (an armed delete, an error, a modal).
2. Dispatch `ux-visual` and `ux-flow` as **separate** passes (owner's call 2026-09-14), plus the
   others the table selects. Give them the diff's file list.
3. **Adjudicate every finding against source** (PLAYBOOK step 5, the #152 precedent). Ledger each
   as `confirmed`, `rejected: <reason>` or `deferred: <issue>`. Fix confirmed Critical and High in
   the PR; file the rest.

## `full`: whole-app review and a redesign decision

1. `scripts/ux_capture.sh` (390 and 320).
2. Dispatch all six experts, scope `full`.
3. Verify. Spot-check every Critical and High against source yourself; drop or downgrade what does
   not hold and say so.
4. Decide, per area (Workout, Home, Progress and PBs, History, Plan, Auth, Shell and nav):
   - **Keep**: no change worth its cost.
   - **Refine**: fixes inside the current structure and tokens.
   - **Redesign**: the structure itself is wrong. Needs at least two experts independently pointing
     at the same structural cause, and the gain stated against what would be lost.
   Where experts disagree, show both positions and pick one with the reason.
5. Write `docs/superpowers/audits/<YYYY-MM-DD>-ux-full-review.md`: verdict, decision table, ranked
   findings (merged and de-duplicated), the disagreements, what to keep, and proposed issues (title,
   `type`/`priority`/`effort`). Do **not** create the issues: list them for the owner.
6. Print a one-screen summary: overall verdict, top five actions, decisions needed from the owner.

## Rules

- The owner's lean constraint (DECISIONS 2026-09-06) still holds for Refine work. A Redesign verdict
  is allowed only in `full` mode (DECISIONS 2026-10-23) and must say what it throws away.
- Cost: `feature` and `change` run two to four experts. `full` runs six; do not run it more than
  once per major release unless the owner asks.
- Screens are gitignored (`frontend/ux-shots/`). Never commit them; attach the ones a finding needs
  to the issue or PR instead.
