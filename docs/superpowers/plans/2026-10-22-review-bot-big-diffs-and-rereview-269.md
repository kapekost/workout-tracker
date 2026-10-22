# Review bot: big diffs and re-review cost (#269 items 3 and 5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development or
> superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Issue:** #269 (effort:M, sized here as two PRs) · **Not in this plan:** item 7 (model-list
privacy, PR #469) and everything #269 lists as done (items 1, 2, 4, 6, the `$SECONDS` label).

**Goal:** the reviewer gets a diff it can finish in its time cap, and says exactly how much of the PR
it was shown. A re-push is reviewed from the last real review forward instead of from scratch. A
review that saw only part of the diff, or only the delta, never approves.

**Why a plan at all:** the Issue gives a menu (stat and file list, no binaries, per-group passes,
incremental re-review, label gate) and not an order, and three things it leaves open decide the
design: who states coverage (the model cannot be trusted to), what "last review" means when the
last bot review was a skip, and how to ship a change whose input builder and prompt run from
different branches. This plan fixes those. It does not restate the Issue's background.

## What is already true (read before starting)

- The `review` job runs the checkout's workflow file (the PR's merge ref) but takes
  `post_review.py` from the default branch. The same pattern applies to anything new here: a script
  the review job runs is read with `git show origin/$DEFAULT_BRANCH:scripts/...`, never from the
  checkout, which the PR author controls. On the PR that adds the script the default branch does not
  have it yet, so the step must fall back to today's behaviour (full diff, no coverage file).
- `pr.diff` is `git diff origin/$BASE...HEAD`, taken before the strip step so the removed agent
  files do not show as the PR's deletions. Binary files already appear in it as one
  "Binary files differ" line, so images cost little; the 107 KB of #267 was text.
- The model's bash allows `git diff *`, `git show *`, `git log *` and denies a space followed by `/`
  and any `../`. `git diff origin/main...HEAD -- backend/main.py` is therefore allowed, so a file
  left out of `pr.diff` can still be read by path.
- The `history` job reports "Last commit this bot reviewed" as the commit of the bot's **last
  review of any kind**. A skipped notice is a review with a `commit_id`, so after a skip the next
  push is diffed from the skipped commit and the changes of that push are never reviewed. Skipped
  and plain posts carry no `<!-- review-round:N -->` marker (see `review_round` in the poster);
  real reviews always do. That marker is the discriminator. Task C fixes this; item 5 is unsafe
  without it.
- `decide_event(counts, kind, has_notes)` already refuses `APPROVE` when notes or limits exist.
  Partial coverage reuses that path, no new event logic.
- Tests: `backend/test_post_review.py` (98 tests, poster), `backend/test_review_workflow.py` (text
  and extracted-snippet checks of the workflow). All existing tests must keep passing unchanged
  except where a task names one.
- Two failures seen on real PRs that the prompt change in PR 2 must address: on #458 the bot
  reported files as deleted that the PR never touched (it read the stripped checkout, not the real
  diff), and on #440 it re-raised one answered finding in five reviews. The PR 2 prompt tells the model
  to judge only what `pr.diff` shows and to skip a finding the prior reviews show as answered,
  unless the new diff changes the answer.
- PR #469 edits the model-list block of the same workflow file. The hunks here touch the diff
  capture, the prompt and the artifact; rebase on whichever merges first.

## Decisions the Issue left open

1. **One pass with a byte budget, not per-group passes.** Per-group runs multiply the 15 minute cap
   and the free-request allowance that CI and local opencode share, and merging several verdicts
   needs a merge rule for severity, round marker and `limits`. A budget plus an honest coverage line
   gets most of the value. Revisit only if "reviewed N of M" shows up often on real PRs.
2. **Coverage is stated by trusted code, not by the model.** A step outside the model's reach writes
   `coverage.json` next to `review.txt`; the poster prints it. The model is told to read omitted
   files by path if time allows, but the printed line counts only what `pr.diff` held, so it
   understates rather than overstates.
3. **What leaves the diff:** binary files (`git diff --numstat` shows `-` for both counts) and
   `package-lock.json`. Nothing else is dropped by type; the rest is ordered, then budgeted.
4. **Order** (first match wins, ties keep git's order): `.github/` and `scripts/` and `Dockerfile*`;
   `backend/` non-test code; `frontend/src` non-test code; test files; everything else, docs last.
   Security-relevant and shipped code is read first; tests and docs are what gets dropped.
5. **Budget: 60,000 bytes of diff text**, a constant at the top of the script. #268 (small) took
   6 minutes and #267 (107 KB) did not finish in 7. Greedy fill in priority order: a file that fits
   is included, one that does not is recorded as omitted and the walk continues, so one giant file
   cannot hide everything behind it. If the first file alone is over budget it is still omitted;
   the model reads it by path.
6. **Re-review from the last real review.** `last` is the commit of the bot's last review whose
   body carries the round marker. If `last` is an ancestor of HEAD and the delta
   (`git diff last HEAD`) is smaller than the full diff, `pr.diff` is the delta. Otherwise (force
   push, history rewritten, a merge from main that makes the delta larger) it is the full diff. The
   full text diff is always also written to `pr.full.diff` for context.
7. **An incremental review is labelled as one.** The poster line says "Reviewed changes since
   `abc1234`". It does not block `APPROVE` by itself, since the prompt already asks for exactly
   this on a re-review and the poster dismisses a stale block only under its existing rule. Partial
   coverage does block it.
8. **No label gate.** A label is a manual step in a flow whose point is to be automatic, and
   incremental diffs already cut the cost of the push-heavy case.

## Task order and PR split

The script and the poster run from the default branch, so they land first and sit dormant; the
workflow wiring lands second and is the only PR that can be exercised live.

### PR 1: Task A (input builder) and Task B (poster coverage line)

**Task A: `scripts/review_input.py`.** Pure functions plus a small CLI, no third-party imports.
Produces for the workflow: `pr.diff`, `pr.full.diff`, `pr.stat`, `pr.omitted.txt` in
`.review-input/`, and `coverage.json` outside the checkout.

- [ ] `classify(path)` returns a priority rank 0 to 4 per decision 4; `is_excluded(path, binary)`
  per decision 3.
- [ ] `split_diff(text)` cuts a unified diff into `(path, chunk)` pairs on `diff --git` headers,
  handling renames (`a/` and `b/` differ: use the `b/` path) and quoted paths.
- [ ] `pick(chunks, budget)` implements decision 5 and returns `(kept, omitted)`.
- [ ] `delta_base(last, head, full_len, run)` implements decision 6; `run` is the injected git
  runner so the test needs no repository. It rejects anything but 40 hex characters before any
  command is built.
- [ ] CLI: `review_input.py BASE_REF LAST_SHA_OR_EMPTY OUT_DIR COVERAGE_PATH`. `coverage.json` holds
  `{"mode": "full"|"incremental", "since": "<sha7 or empty>", "shown": n, "total": n,
  "omitted": ["path", ...]}`; `total` counts text files after the exclusions in decision 3.

Tests in `backend/test_review_input.py` (names and intent; write them red first):
`test_a_binary_file_is_left_out_and_not_counted`, `test_the_lockfile_is_left_out`,
`test_code_is_ordered_before_tests_and_tests_before_docs`, `test_workflow_and_script_changes_come_first`,
`test_a_file_that_fits_is_kept_after_one_that_does_not`, `test_a_single_file_over_budget_is_omitted_not_truncated`,
`test_a_renamed_file_is_filed_under_its_new_path`, `test_the_delta_is_used_when_last_is_an_ancestor_and_smaller`,
`test_a_force_push_falls_back_to_the_full_diff`, `test_a_delta_larger_than_the_full_diff_falls_back`,
`test_a_last_sha_that_is_not_40_hex_is_ignored`, `test_coverage_json_counts_shown_and_total`.

**Task B: poster coverage line in `scripts/post_review.py`.**

- [ ] `read_coverage(review_path)`: reads `coverage.json` from the same directory, returns `None` for
  a missing, unparseable or wrongly typed file. Every string goes through `sanitize` (file names
  are attacker-controlled), ints are checked with `isinstance(x, int)` and bounded, `omitted` is
  capped at 5 names plus a count.
- [ ] `build` gains an optional `coverage` argument. It renders one block after Notes:
  `**Coverage** reviewed N of M changed files` (plus `since abc1234` for an incremental run and a
  short omitted list). Skipped notices ignore it.
- [ ] Partial coverage (`shown < total`) passes `has_notes=True` into `decide_event`, so the state is
  `COMMENT`, never `APPROVE`. `REQUEST_CHANGES` is unaffected.
- [ ] `main` calls `read_coverage` and passes the result in; the 4-argument CLI is unchanged.

Tests added to `backend/test_post_review.py`:
`test_coverage_of_all_files_is_one_line_and_still_approves_a_clean_review`,
`test_partial_coverage_prevents_approve_and_lists_omitted_files`,
`test_partial_coverage_still_requests_changes_for_a_major`,
`test_an_incremental_review_names_the_commit_it_started_from`,
`test_coverage_file_names_are_sanitized_like_findings`,
`test_a_malformed_coverage_file_is_ignored_not_fatal`,
`test_a_skipped_notice_prints_no_coverage`.

### PR 2: Task C (workflow wiring and prompt)

- [ ] **History job:** "Last commit this bot reviewed" is taken only from bot reviews whose body
  contains `<!-- review-round:` (extend the existing `select`). This also repairs the re-review after
  a skip described above. Keep the full review list below it unchanged.
- [ ] **Capture step:** replace the single `git diff ... > pr.diff` with a run of the default
  branch's `review_input.py` (read with `git show`, written outside the checkout, same pattern and
  same `|| rm -f` fallback as `post_review.py`). `last` comes from the first
  `Last commit this bot reviewed:` line of `.review-input/prior-reviews.md` (it is the third line, ahead
  of any review text), matched against `^[0-9a-f]{40}$` only. Missing script: write
  today's `pr.diff` and no `coverage.json`. The order stays "diff before the strip".
- [ ] **Artifact:** the `review` artifact uploads `review.txt` and `coverage.json` (if present).
  The `post` job already downloads the whole artifact into `review-out/`.
- [ ] **Prompt:** replace the First review / Re-review bullets with: read `.review-input/pr.stat`
  first; `pr.diff` is the diff to review and says in its first line whether it is the whole PR or
  the changes since the last review; `pr.full.diff` is context only; files listed in
  `pr.omitted.txt` were left out for size and may be read with
  `git diff origin/<base>...HEAD -- <path>` if there is time. Remove the sentence telling the model
  to compute `git diff <commit>...HEAD` itself. Keep the "stripped sandbox is never a finding" text.
- [ ] **Docs:** one paragraph in AGENTS.md "The automated PR reviewer" (budget, ordering, coverage
  line, incremental re-review, partial coverage cannot approve). State what is true now, no history.

Tests added to `backend/test_review_workflow.py`:
`test_last_reviewed_commit_ignores_reviews_without_a_round_marker`,
`test_the_input_builder_is_read_from_the_default_branch_not_the_checkout`,
`test_a_missing_input_builder_falls_back_to_the_plain_pr_diff`,
`test_only_a_40_hex_last_commit_reaches_the_builder`,
`test_the_review_artifact_includes_the_coverage_file`,
`test_the_prompt_points_at_stat_diff_full_diff_and_omitted_files`.

## Verification that is easy to skip

- **Neither PR exercises the new path on itself.** PR 1 is dormant by design. PR 2 runs its own
  workflow file but takes the builder from `main`, which has it only after PR 1. So PR 2 is the first
  that can be seen working; read its own bot review for the Coverage block before merging.
- **Run the builder by hand on a real big diff** before PR 1 is marked ready: check out an old
  branch of a big PR (the #267 range has the 14 PNGs), run the CLI, confirm binaries are absent, the
  budget holds and `coverage.json` matches `git diff --stat`. Paste the three decisive lines in
  the PR.
- **A skipped push, then a push.** After PR 2 merges, on a throwaway same-repo PR: force one skip
  (a run with no usable model is hard to stage, so instead assert the history `select` against a
  saved reviews JSON in the test and say in the PR that the live skip path was not driven), then
  confirm a normal second push is reviewed from the right commit.
- **Force push** on the throwaway PR: confirm the run falls back to `mode: "full"`.
- Full suites: backend `pytest -q` and frontend `npm test`. No app code changes, so no deploy.
- `actionlint` on the workflow (the repo's `workflow-lint.yml` runs it in CI).

## Process

- Both PRs change the review pipeline: `security-ai-reviewer` before merge, no `approved` label from
  an agent, and a skipped bot review means a `staff-engineer-reviewer` pass is mandatory.
- Sync rule: after PR 2 merges, check kapekost-web's `opencode-review.yml` and `post_review.py`
  for the same change, adapt to its own state, run its tests, one PR there, never push its `main`.
- PR bodies carry the exact line `Changelog: none`.
- Out of scope, recorded for later: a combined cap on total review minutes per PR per day, and
  per-group passes (decision 1).
