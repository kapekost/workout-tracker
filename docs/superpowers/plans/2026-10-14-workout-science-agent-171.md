# Workout-science agent (#171) Implementation Plan

**Issue:** #171 · **Owner decision (2026-10-12):** workout-science first, nutrition later.
Gates #167 and #170, which need a reviewer for training-science claims before they build.

**Goal:** one read-only agent definition, `.claude/agents/workout-science.md`, that reviews a
diff, spec or UI string for what it claims about training science, and a PLAYBOOK line that says
when to call it. No app code, no deploy.

## Decisions

**What it may claim.** Only what `docs/superpowers/research/2026-08-16-recovery-science.md`
supports, at the confidence that document gives. The agent does not carry its own copy of the
numbers: it reads the research note each time, so a corrected note corrects the agent. Its
verdicts are about claims, not about code style.

**What it must refuse.** The eight "must NOT claim" items in §7 of the note are its checklist:
no recovery percentage, no "readiness", no overtraining or injury warnings, no individual
calibration, no "losing muscle" before about 3 weeks off, no MPS curve as a growth curve, no
size-based recovery tiers, and the estimate never overrides the user. It also flags MEV/MAV/MRV
stated as validated per-muscle numbers (§6). A claim the note does not cover is reported as
`unsupported`, not guessed at.

**Tools: `Read, Grep, Glob`.** Same as `reviewer`. It needs the note, the diff's files and
nothing else. No Bash, no web: a web-capable science agent would pull in sources nobody checked.
New evidence enters through a research task (`mattpocock-skills:research`) that updates the
note, then the agent follows.

**Who calls it.** The orchestrator, in PLAYBOOK step 5 (Gate), when a change touches code or copy
that states something about training: `frontend/src/lib/recovery.js`, `muscles.js`,
`overload.js`, the plan seed, exercise cues, volume or frequency text, and any spec for
#167, #170 or the adaptive-coaching backlog item. It is an extra reviewer, not a gate, and its
findings are verified against the note like any other review.

**Output.** Findings ranked by severity, each with the claim, `file:line`, the note section that
supports or contradicts it, and one of `contradicted`, `overclaim`, `unsupported`. A short
"supported" list at the end so a clean result is distinguishable from an unread one.

## Tasks

1. **Agent definition.** Write `.claude/agents/workout-science.md` (frontmatter in the style of
   `reviewer.md`: name, description, `tools: Read, Grep, Glob`, `model: inherit`). Body: the
   method above, short. Check: frontmatter parses, tools are exactly the three.
2. **PLAYBOOK wiring.** One bullet in step 5 (Gate) naming the trigger files and the agent. Check:
   `git diff` is the added lines only.
3. **Try it once.** Run the agent on `frontend/src/lib/recovery.js` and its UI strings. A result
   that cites note sections and does not invent numbers is the pass. Record anything it got
   wrong in the PR description, and fix the definition if the miss is the definition's fault.
4. **Close #171** with the PR; #167 and #170 get a comment that the reviewer now exists.

## Out of scope

Nutrition (#33 is merged into #32 and its design exists; add a second agent only when a feature
needs it). Any new research or new numbers. Any change to app code or copy.
