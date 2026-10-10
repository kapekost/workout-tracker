"""opencode-review.yml: the review model list is built in one place with the privacy option."""
import json
import re
import subprocess
from pathlib import Path

TEXT = (Path(__file__).resolve().parent.parent / ".github" / "workflows" / "opencode-review.yml").read_text()


def test_the_config_has_no_hardcoded_models_so_nothing_can_skip_data_collection_deny():
    heredoc = re.search(r"cat > opencode\.json <<'JSON'\n(.*?)\n\s*JSON\n", TEXT, re.S).group(1)
    assert json.loads(heredoc)["provider"]["openrouter"]["models"] == {}


def test_generated_config_denies_data_collection_for_every_listed_model(tmp_path):
    heredoc = re.search(r"cat > opencode\.json <<'JSON'\n(.*?)\n\s*JSON\n", TEXT, re.S).group(1)
    jq_filter = re.search(r"jq --rawfile m \"\$RUNNER_TEMP/models.txt\" \\\n\s*'(.*?)' \\\n", TEXT, re.S).group(1)
    (tmp_path / "opencode.json").write_text(heredoc)
    (tmp_path / "models.txt").write_text("stealth/x-alpha\ncohere/north-mini-code:free\nopenrouter/free\n")
    out = subprocess.run(["jq", "--rawfile", "m", str(tmp_path / "models.txt"), jq_filter, str(tmp_path / "opencode.json")],
                         capture_output=True, text=True, check=True).stdout
    models = json.loads(out)["provider"]["openrouter"]["models"]
    assert list(models) == ["stealth/x-alpha", "cohere/north-mini-code:free", "openrouter/free"]
    assert all(m["options"]["provider"]["data_collection"] == "deny" for m in models.values())


def test_the_free_router_is_listed_first_and_never_twice():
    block = TEXT[TEXT.index("# The one model list"):TEXT.index("} > \"$RUNNER_TEMP/models.txt\"")]
    assert block.index("echo openrouter/free") < block.index("curl")
    assert block.count("openrouter/free") == 1


def test_the_loop_runs_the_generated_list_and_reports_the_winner():
    assert 'mapfile -t models < "$RUNNER_TEMP/models.txt"' in TEXT
    assert 'used="$model"; break' in TEXT
    assert "REVIEW_MODEL: ${{ needs.review.outputs.model }}" in TEXT


def test_a_discarded_review_is_never_signed():
    leak = TEXT.index("review output contained the API key; discarded")
    assert TEXT.index('used=""', leak) < TEXT.index('echo "model=$used"', leak)


def _run_model_loop(tmp_path, err, out="partial output\n"):
    """Run the workflow's real model loop with a stub opencode that fails with `err`."""
    start = TEXT.index("set +e\n")
    end = TEXT.index("# The key is known here", start)
    body = "\n".join(line.removeprefix("          ") for line in TEXT[start:end].splitlines())
    # macOS ships bash 3.2 without mapfile; the shim is equivalent for the one call the loop makes.
    body = 'mapfile() { models=(); while IFS= read -r l; do models+=("$l"); done; }\n' + body
    bindir = tmp_path / "bin"
    bindir.mkdir()
    (bindir / "timeout").write_text('#!/bin/bash\nwhile [[ "$1" == -* || "$1" =~ ^[0-9]+$ ]]; do\n  if [ "$1" = -k ]; then shift; fi\n  shift\ndone\nexec "$@"\n')
    (bindir / "opencode").write_text(f'#!/bin/bash\necho "$3" >> "$RUNNER_TEMP/tried.txt"\nprintf %s {out!r}\necho {err!r} >&2\nexit 1\n')
    for f in bindir.iterdir():
        f.chmod(0o755)
    (tmp_path / "models.txt").write_text("a/one\nb/two\n")
    env = {"PATH": f"{bindir}:/usr/bin:/bin", "RUNNER_TEMP": str(tmp_path), "GITHUB_STEP_SUMMARY": str(tmp_path / "sum"),
           "GITHUB_OUTPUT": str(tmp_path / "gho"), "REVIEW_PROMPT": "x"}
    subprocess.run(["bash", "-c", body], env=env, check=True, capture_output=True)
    return (tmp_path / "tried.txt").read_text().split(), (tmp_path / "skip-reasons.txt").read_text(), (tmp_path / "review.txt").read_text()


def test_the_daily_free_model_limit_stops_the_loop_and_is_named(tmp_path):
    tried, reasons, review = _run_model_loop(tmp_path, "Rate limit exceeded: free-models-per-day")
    assert tried == ["openrouter/a/one"]
    assert reasons.strip() == "- `a/one`: daily free-model limit reached"
    assert review == ""


def test_an_ordinary_rate_limit_still_tries_the_next_model(tmp_path):
    tried, reasons, review = _run_model_loop(tmp_path, "Rate limit exceeded: try later")
    assert tried == ["openrouter/a/one", "openrouter/b/two"]
    assert reasons.count("rate limited") == 2
    assert review == ""


def test_only_owner_prs_run_in_every_job():
    assert TEXT.count("github.event.pull_request.user.login == github.repository_owner") == TEXT.count("github.actor != 'dependabot[bot]'") == 3


def test_the_pr_diff_is_captured_before_the_checkout_is_stripped():
    assert TEXT.index('> .review-input/pr.diff') < TEXT.index("-o -name AGENTS.md")
    assert "read `.review-input/pr.diff` in full" in TEXT


def test_the_prompt_tells_the_reviewer_it_cannot_run_tests_or_claim_their_result():
    assert "never claim that a test fails or passes" in TEXT
