# Review bot severity tiers (#266) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development or
> superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Issue:** #266 (labelled effort:S, sized here as three effort:S tasks, so it ships as three PRs)
· **Companion:** #269 (reliability and feedback quality; its item 6 is the same `has_verdict` pin
as the third deferred nit here, so this plan closes both)

**Goal:** the review bot's verdict becomes a signal the owner can act on at a glance. Critical and
major findings post `REQUEST_CHANGES`. A review with only minor findings posts `APPROVE` when the
repo allows it and `COMMENT` when it does not. Minor findings sit in one short "Deferred" list and
are never inline. A later clean run clears the bot's own sticky `REQUEST_CHANGES`. After two rounds
on one PR only critical findings still block. The three verdict-scan nits deferred from #265 close
on the way.

**Why a plan at all:** the Issue lists a proposal, not an ordered sequence, and it leaves open how
"round" is counted, how a clean run clears a sticky review, what happens when GitHub refuses a
state, and how to ship a change whose two halves (prompt in the workflow, parser in the poster) run
from different branches. This plan fixes those. It does not restate the Issue's background.

## What is already true (read before starting)

- `scripts/post_review.py` always posts `"event": "COMMENT"`. It runs in the `post` job from the
  **default branch** with a write token. The workflow file itself runs from the **PR's merge ref**.
  So on the PR that changes both, the new prompt meets the old poster. Task order below exists
  because of this.
- The model's JSON is untrusted and derived from attacker-controlled text. `REQUEST_CHANGES` driven
  by it fails safe (it blocks, and nothing in this repo is blocked by a review state, see DECISIONS
  2026-10-05). `APPROVE` fails open. Both are harmless only while no branch protection counts them.
- Repo setting `can_approve_pull_request_reviews` is `false` (checked 2026-10-08). The poster cannot
  read that setting with `GITHUB_TOKEN`, so it must treat a refused `APPROVE` as a normal outcome.
- Existing tests in `backend/test_post_review.py` pin the sanitising, capping, secret withholding and
  skipped-notice behaviour. All of them must keep passing unchanged except where a task names one.
- Open PR #279 edits the model list in `.github/workflows/opencode-review.yml`. Task B edits the
  prompt and the verdict step in the same file. Rebase on whichever merges first; the hunks do not
  overlap.

## Decisions the Issue left open

1. **Severity vocabulary.** `critical`: a realistic failure in the shipped behaviour with a concrete
   trigger (data loss, wrong result, crash, auth or secret exposure, a gate that does not gate).
   `major`: a real defect with lower reach (missing test for changed behaviour, doc asserting
   something untrue, regression on a rare path). `minor`: everything else, including speculative or
   edge-case hardening of a path no caller reaches, retry-path polish, naming, taste. Both `critical`
   and `major` request changes. The difference is only the round cap (decision 5).
2. **Legacy input.** A finding with a valid `severity` uses it. Without one, `blocking: true` maps to
   `major` and anything else to `minor`. A `severity` outside the three words is treated as absent.
   The prompt keeps emitting `blocking` alongside `severity` (derived: true for critical and major)
   so the old poster on the default branch reads the new prompt correctly during the transition.
   The poster never lets `blocking` override a valid `severity`.
3. **Event mapping is one pure function.** `decide_event(counts, kind, demoted)` returns
   `REQUEST_CHANGES`, `APPROVE` or `COMMENT`. Rules, in order:
   - not a structured review, a skipped notice, a withheld secret, or any malformed finding dropped
     during validation: `COMMENT` (never approve what could not be fully read);
   - one or more critical, or one or more major still counted: `REQUEST_CHANGES`;
   - one or more finding demoted by the round cap: `COMMENT` (a finding was seen and not counted, so
     never `APPROVE`);
   - otherwise: `APPROVE`.
   The poster, not the model, picks the event. The model has no field that names one.
4. **A refused state falls back, once, to `COMMENT`.** `APPROVE` returns 422 while the setting is off
   (`GitHub Actions is not permitted to approve pull requests`). `REQUEST_CHANGES` returns 422 on a PR
   the bot itself authored. Either way the poster re-posts the same body as `COMMENT`, headline
   unchanged, and logs the reason to stderr. Do not read the setting through the API (needs admin).
   The existing "fold inline comments into the body on 422" fallback stays and runs after this one.
5. **Round counting lives in the poster, not the prompt.** The poster writes a hidden marker
   `<!-- review-round:N -->` as the last line of its own body (model text cannot carry one: `sanitize`
   strips `<...>` and escapes any `<` left over). Before posting it lists the PR's reviews, keeps those
   whose `user.login` is `github-actions[bot]` (an API field, not review text) and whose body carries
   the marker, and sets `N = count + 1`. Skipped notices and plain output carry no marker, so a
   provider failure does not use up a round. At `N > 2` the poster demotes every `major` to the
   Deferred list, marked "past the round cap", and only `critical` can request changes. The prompt
   is also told about the cap, but the rule is enforced mechanically, since a model cannot be trusted
   to count.
6. **Clearing a sticky `REQUEST_CHANGES`.** After a successful post, if the new verdict has no
   critical, no major (counted) and is a structured non-skipped review, dismiss each earlier review
   by `github-actions[bot]` whose `state` is `CHANGES_REQUESTED`, through
   `PUT /pulls/{pr}/reviews/{id}/dismissals` with a fixed message ("Superseded by a clean re-review of
   <short sha>."). A successful `APPROVE` already replaces the old state on GitHub, but dismissal is
   run in both cases so the `COMMENT` fallback clears too. Dismissal failure is non-fatal and is
   logged. Never dismiss before the new review posts, so there is no window with no signal, and never
   dismiss on a skipped, plain or withheld run, for the same reason thread resolution is skipped
   there.
7. **Sorting before capping.** Findings are ordered critical, major, minor before the 20-finding cap,
   so a pile of minor nits cannot push a critical finding out of the review.
8. **Minor findings.** One `**Deferred**` list in the body, at most three lines, plus
   `and N more not shown` when there are more. The count is honest about what was dropped. Minor
   findings are never inline comments, whatever their line.
9. **Verdict scan: walk, don't count braces.** The current loop spends one of 40 attempts per `{`, so
   a restated example with many braces ends the window early. Replace it with a forward scan that, on
   a successful decode, searches the decoded object (depth capped, iterative) for the last verdict and
   jumps past that object's end, and counts an attempt only on a failed decode. Total attempts stay
   capped (200) so the pathological-input test still finishes in seconds.
10. **Placeholder summaries.** `is_verdict` rejects a summary with no word character
    (`re.search(r"\w", s)` fails), as well as one starting with `<`. That covers `"..."`, `"…"` and
    `"-"`.
11. **One `is_verdict`, not two.** The workflow's inline `has_verdict` is deleted. The review job
    already fetches default-branch copies of files for the model; it also writes
    `scripts/post_review.py` from `origin/$DEFAULT_BRANCH` to `.review-input/` and calls
    `python3 .review-input/post_review.py --check-verdict <file>`. It must be the default-branch copy,
    never the checkout's: the step that runs the model holds `OPENROUTER_API_KEY`, so running a
    PR-editable script there would hand the key to the PR author. Bootstrap rule: if the file is
    missing or exits 2 (an older poster with no such mode), accept any non-empty output and let the
    post job render it.
12. **Model tier.** Task C touches the job that holds a write token and decides what untrusted text
    may do with it. It is not "destructive" under GUARDRAILS (no auth, session, secret or token
    handling changes, no schema), but run it on the stronger tier and give it a reviewer subagent
    pass. A and B can go on either tier; both have named tests.

## Task order

Three PRs, each mergeable alone, in this order. Do not merge C before B.

### Task A: poster scan fixes and the shared check (scripts only; no change to what is posted)

**Files:** `scripts/post_review.py`, `backend/test_post_review.py`. **Produces:** `--check-verdict`
mode and the fixed scanner that Task B calls.

- [ ] Tests first, each watched to fail on current `main`:
  - `test_a_verdict_after_many_braces_is_still_found` (40+ leading `{}` objects, then a real answer)
  - `test_an_example_shaped_verdict_before_many_braces_does_not_win` (example verdict, 45 brace objects,
    different real verdict last: the last one wins)
  - `test_a_placeholder_summary_of_dots_is_not_a_verdict` (`"..."`, `"…"`, `"-"`)
  - `test_a_real_summary_with_punctuation_is_still_a_verdict`
  - `test_check_verdict_exits_0_for_a_verdict_and_1_for_anything_else` (runs `main` with
    `--check-verdict`; covers empty file, prose, placeholder echo)
  - `test_check_verdict_agrees_with_extract_json_on_a_corpus` (the corpus is every existing test input;
    this is the pin that stops the two paths drifting, replacing the inline copy)
- [ ] Rewrite `extract_json` per decision 9 and widen `is_verdict` per decision 10. The existing
  `test_pathological_input_is_bounded_and_does_not_raise`, `test_a_verdict_nested_in_another_object_is_found`
  and `test_the_last_findings_object_wins_over_an_example_before_it` must pass untouched.
- [ ] Add the `--check-verdict <file>` branch to `main`: reads at most `MAX_INPUT`, exit 0 or 1, no
  network, no `gh`. Argument counts other than the two modes still print usage and return 2.
- [ ] Run `backend/.venv/bin/python -m pytest backend/test_post_review.py -q`. Then mutate once on
  purpose (restore the old 40-attempt loop) and confirm the new scan tests fail, then restore.

### Task B: workflow prompt and the single verdict check (no poster change)

**Files:** `.github/workflows/opencode-review.yml`. Depends on A being on the default branch.

- [ ] Prompt section 2: replace the Blocking/Not blocking paragraph with the severity definitions in
  decision 1, the realistic-failure test (each critical or major names the input or state that
  triggers it), and the rule that speculative or edge-case hardening, retry-path polish and naming are
  `minor`. State the round cap in one sentence. Say the output is posted as a review under the bot's
  login and is still not the owner's approval.
- [ ] Prompt section 3: JSON shape gains `"severity": "critical|major|minor"`; `blocking` stays,
  derived (decision 2). Keep the line about never inventing a `line`.
- [ ] Add the default-branch copy of `scripts/post_review.py` to `.review-input/` next to the existing
  `base-AGENTS.md` copy, and replace the inline `has_verdict` function body with the call from
  decision 11 including the bootstrap rule. Delete the inline Python.
- [ ] Verify without a live run: `actionlint` on the file (the repo's `workflow-lint.yml` does this in
  CI), then a local dry run of just the shell function against four fixture files (valid verdict,
  prose only, placeholder echo, empty) using a stub that calls the Task A script. Record the output in
  the PR body.
- [ ] Verify live: the PR for Task B is itself reviewed by the bot. Check the job summary shows a
  usable verdict and the review body reads sensibly under the new prompt (old poster, so still a
  `COMMENT`).

### Task C: severity, events, dismissal, round cap, docs (poster plus docs)

**Files:** `scripts/post_review.py`, `backend/test_post_review.py`, `AGENTS.md` (reviewer section),
`docs/orchestration/GUARDRAILS.md` and `docs/orchestration/DECISIONS.md` as they exist on `main`.
Do **not** edit `.github/workflows/opencode-review.yml` here: the PR's own run would pair a changed
prompt with the old poster (see "What is already true").

- [ ] Tests first (names, intent in the comment after each):
  - `test_severity_wins_over_blocking_when_both_are_present`
  - `test_blocking_true_without_severity_is_major_and_false_is_minor` (legacy input)
  - `test_an_unknown_severity_word_is_treated_as_absent`
  - `test_critical_or_major_requests_changes`
  - `test_only_minor_findings_approve`
  - `test_clean_review_approves`
  - `test_skipped_plain_and_withheld_never_approve` (all three give `COMMENT`)
  - `test_a_dropped_malformed_finding_prevents_approve`
  - `test_minor_findings_are_deferred_never_inline_and_capped_at_three_with_a_count`
  - `test_major_inline_when_on_a_changed_line_and_in_the_body_when_not`
  - `test_critical_findings_survive_the_cap_when_there_are_many_minors` (decision 7)
  - `test_round_marker_is_written_and_cannot_be_forged_by_model_text`
  - `test_round_is_prior_marked_bot_reviews_plus_one` (stub `gh`; reviews by other logins and unmarked
    bot reviews do not count)
  - `test_past_the_round_cap_majors_are_deferred_and_criticals_still_request_changes`
  - `test_past_the_round_cap_with_a_demoted_major_comments_instead_of_approving`
  - `test_approve_refused_with_422_is_reposted_as_comment`
  - `test_request_changes_refused_with_422_is_reposted_as_comment`
  - `test_a_clean_run_dismisses_earlier_changes_requested_by_the_bot_only`
  - `test_no_dismissal_on_skipped_plain_withheld_or_blocking_runs`
  - `test_dismissal_failure_does_not_fail_the_job`
  The `gh` calls go through the existing `gh()` helper, so stub that one function and assert on the
  payloads; no network in tests.
- [ ] Implement `severity_of(finding)`, `decide_event`, the round count, the marker, the sorted cap, the
  Deferred list, the event post with the fallbacks (decision 4) and the dismissal (decision 6). Keep
  `build()`'s return shape extensible: return a small result object or add fields, and update the
  callers and the existing tests that unpack three values in one step. Headlines: `**BLOCKING**` when
  the event is `REQUEST_CHANGES` (including after a fallback), `**CLEAN**` otherwise, unchanged text.
- [ ] Docs in the same PR. `AGENTS.md` reviewer section: the bot now posts `REQUEST_CHANGES`, `APPROVE`
  or `COMMENT`, minor findings are deferred, the round cap, the 422 fallbacks, and the sentence
  "posts as a COMMENT, never --approve or --request-changes" is removed. Say that `APPROVE` needs the
  repo setting, which is an owner decision, and that an approval is one more agent review. `GUARDRAILS.md`
  "Merge & branch rules" bullet: it says the bot "cannot submit a GitHub review state at all"; rewrite
  it to say the **model** holds no token and the post job submits the state, that no review state
  blocks a merge, and that a `REQUEST_CHANGES` is handled like red CI. `DECISIONS.md`: one entry
  recording severity tiers, the round cap, that `APPROVE` is optional and falls back, and that the
  2026-10-03 line "posts a comment, not a review state" is superseded. Plain prose, no em-dashes.
  The home branch carries its own copies of `GUARDRAILS.md` and `DECISIONS.md`; the orchestrator's
  write-back for this tick makes the same edit there.
- [ ] Verification that is easy to skip: after merge, open a throwaway PR from a same-repo branch that
  adds one deliberate bug, and confirm in order: first push gets `REQUEST_CHANGES`; a fix push gets a
  `COMMENT` or `APPROVE` and the earlier state is dismissed; a third push with a new major-only finding
  shows it under Deferred. A unit test cannot show GitHub's real 422 text, so copy the real message
  into the fallback test's fixture from that run. Close the throwaway PR unmerged.

## Out of scope

- Enabling "Allow GitHub Actions to create and approve pull requests". Owner decision (it also lets
  workflows open PRs). Until it is on, every clean run posts `COMMENT` and says so in stderr only.
- Branch protection, required reviewers, CODEOWNERS (DECISIONS 2026-10-05).
- The rest of #269: dead fallback models, sandbox diagnostics in Notes, large diffs, a skipped review
  looking green, per-push cost. Only its item 6 is closed here.
- Dropping `blocking` from the prompt. Optional cleanup once `severity` has run for a while.

## Risks to watch

- **A model that marks everything minor** makes the bot useless; one that marks everything major makes
  it noisy. The calibration text is the only lever on the model side, so read the first three real
  reviews after Task B and adjust the wording, not the poster.
- **`APPROVE` is a fail-open signal.** Nothing counts it today. If branch protection or an auto-merge
  rule ever starts reading review state, revisit decision 3 first (the Issue says the same).
- **Marker forging by a collaborator.** Anyone with write access can already comment, but only reviews
  whose author login is the bot count, and a human cannot post as it. A forged marker is not a path.
