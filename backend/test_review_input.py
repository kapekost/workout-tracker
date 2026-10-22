"""scripts/review_input.py: what the reviewer is shown, and the coverage it is held to."""
import importlib.util
import json
import subprocess
from pathlib import Path

import pytest

spec = importlib.util.spec_from_file_location(
    "review_input", Path(__file__).resolve().parent.parent / "scripts" / "review_input.py")
ri = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ri)

SHA = "a" * 40


def chunk(path, body="+x\n", old=None):
    return f"diff --git a/{old or path} b/{path}\n--- a/{old or path}\n+++ b/{path}\n@@ -1 +1 @@\n{body}"


def binary(path):
    return f"diff --git a/{path} b/{path}\nBinary files a/{path} and b/{path} differ\n"


def paths(pairs):
    return [p for p, _ in pairs]


def test_a_binary_file_is_left_out_and_not_counted():
    text = chunk("backend/main.py") + binary("docs/shot.png")
    shown, total, omitted = ri.select(text, 10_000)
    assert paths(shown) == ["backend/main.py"] and total == 1 and omitted == []


def test_the_lockfile_is_left_out():
    text = chunk("frontend/package-lock.json") + chunk("frontend/src/App.jsx")
    shown, total, _ = ri.select(text, 10_000)
    assert paths(shown) == ["frontend/src/App.jsx"] and total == 1


def test_code_is_ordered_before_tests_and_tests_before_docs():
    text = "".join(chunk(p) for p in [
        "docs/a.md", "backend/test_main.py", "frontend/src/App.test.jsx", "frontend/src/App.jsx",
        "backend/main.py"])
    shown, _, _ = ri.select(text, 10_000)
    assert paths(shown) == ["backend/main.py", "frontend/src/App.jsx",
                            "backend/test_main.py", "frontend/src/App.test.jsx", "docs/a.md"]


def test_workflow_and_script_changes_come_first():
    text = "".join(chunk(p) for p in ["backend/main.py", "Dockerfile.sandbox", "scripts/x.sh",
                                      ".github/workflows/a.yml"])
    shown, _, _ = ri.select(text, 10_000)
    assert paths(shown) == ["Dockerfile.sandbox", "scripts/x.sh", ".github/workflows/a.yml",
                            "backend/main.py"]


def test_a_file_that_fits_is_kept_after_one_that_does_not():
    big = chunk("backend/big.py", "+" + "y" * 500 + "\n")
    small = chunk("docs/small.md")
    shown, total, omitted = ri.select(big + small, 300)
    assert paths(shown) == ["docs/small.md"] and omitted == ["backend/big.py"] and total == 2


def test_a_single_file_over_budget_is_omitted_not_truncated():
    big = chunk("backend/big.py", "+" + "y" * 500 + "\n")
    shown, total, omitted = ri.select(big, 100)
    assert shown == [] and omitted == ["backend/big.py"] and total == 1


def test_a_renamed_file_is_filed_under_its_new_path():
    text = ("diff --git a/old/name.py b/backend/new.py\nsimilarity index 90%\n"
            "rename from old/name.py\nrename to backend/new.py\n--- a/old/name.py\n"
            "+++ b/backend/new.py\n@@ -1 +1 @@\n+x\n")
    assert paths(ri.split_diff(text)) == ["backend/new.py"]


def test_a_quoted_path_is_decoded():
    text = 'diff --git "a/docs/sp ac\\303\\251.md" "b/docs/sp ac\\303\\251.md"\n--- a\n+++ b\n+x\n'
    assert paths(ri.split_diff(text)) == ["docs/sp acé.md"]


def test_a_path_with_a_space_is_kept_whole():
    text = chunk("docs/a b.md")
    assert paths(ri.split_diff(text)) == ["docs/a b.md"]


def fake_run(outputs):
    return lambda args: outputs.get(args[0])


def test_the_delta_is_used_when_last_is_an_ancestor_and_smaller():
    run = fake_run({"merge-base": "", "diff": "delta text\n"})
    assert ri.delta_diff(SHA, SHA[:-1] + "b", 1000, run) == "delta text\n"


def test_a_force_push_falls_back_to_the_full_diff():
    run = fake_run({"merge-base": None, "diff": "delta text\n"})
    assert ri.delta_diff(SHA, SHA[:-1] + "b", 1000, run) is None


def test_a_delta_larger_than_the_full_diff_falls_back():
    run = fake_run({"merge-base": "", "diff": "d" * 50})
    assert ri.delta_diff(SHA, SHA[:-1] + "b", 49, run) is None


def test_an_empty_delta_falls_back():
    run = fake_run({"merge-base": "", "diff": "\n"})
    assert ri.delta_diff(SHA, SHA, 1000, run) is None


def test_a_last_sha_that_is_not_40_hex_is_ignored():
    calls = []

    def run(args):
        calls.append(args)
        return ""

    for bad in ["", "abc1234", "--output=x", SHA.upper(), SHA + "0", "g" * 40]:
        assert ri.delta_diff(bad, SHA, 1000, run) is None
    assert calls == []


def git(repo, *args):
    return subprocess.run(["git", "-C", str(repo), *args], check=True, capture_output=True,
                          text=True, env={"GIT_CONFIG_GLOBAL": "/dev/null", "GIT_CONFIG_SYSTEM": "/dev/null",
                                          "PATH": "/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin",
                                          "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t",
                                          "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@t"}).stdout


def make_repo(tmp_path):
    repo = tmp_path / "repo"
    repo.mkdir()
    git(repo, "init", "-q", "-b", "main")
    (repo / "README.md").write_text("hi\n")
    git(repo, "add", "-A")
    git(repo, "commit", "-qm", "base")
    git(repo, "checkout", "-qb", "feat")
    (repo / "backend").mkdir()
    (repo / "backend" / "main.py").write_text("print(1)\n")
    (repo / "img.png").write_bytes(b"\x89PNG\x00\x01\x02")
    (repo / "package-lock.json").write_text("{}\n")
    git(repo, "add", "-A")
    git(repo, "commit", "-qm", "one")
    return repo


def test_coverage_json_counts_shown_and_total(tmp_path):
    repo = make_repo(tmp_path)
    out, cov = tmp_path / "out", tmp_path / "coverage.json"
    ri.build_input(str(repo), "main", "", out, cov, budget=10_000)
    data = json.loads(cov.read_text())
    assert data == {"mode": "full", "since": "", "shown": 1, "total": 1, "omitted": []}
    assert "backend/main.py" in (out / "pr.diff").read_text()
    assert "img.png" not in (out / "pr.diff").read_text()
    assert (out / "pr.diff").read_text().startswith("# Whole PR")
    assert "img.png" in (out / "pr.stat").read_text()
    assert (out / "pr.omitted.txt").read_text() == ""


def test_a_second_push_is_reviewed_from_the_last_review(tmp_path):
    repo = make_repo(tmp_path)
    last = git(repo, "rev-parse", "HEAD").strip()
    (repo / "backend" / "second.py").write_text("print(2)\n" * 40)
    git(repo, "add", "-A")
    git(repo, "commit", "-qm", "two")
    out, cov = tmp_path / "out", tmp_path / "coverage.json"
    ri.build_input(str(repo), "main", last, out, cov, budget=10_000)
    data = json.loads(cov.read_text())
    assert data["mode"] == "incremental" and data["since"] == last[:7] and data["total"] == 1
    diff = (out / "pr.diff").read_text()
    assert diff.startswith(f"# Changes since {last[:7]}") and "second.py" in diff
    assert "main.py" not in diff and "backend/main.py" in (out / "pr.full.diff").read_text()


def test_omitted_files_are_listed_for_the_model(tmp_path):
    repo = make_repo(tmp_path)
    out, cov = tmp_path / "out", tmp_path / "coverage.json"
    ri.build_input(str(repo), "main", "", out, cov, budget=10)
    data = json.loads(cov.read_text())
    assert data["shown"] == 0 and data["total"] == 1 and data["omitted"] == ["backend/main.py"]
    assert (out / "pr.omitted.txt").read_text() == "backend/main.py\n"


def test_a_failed_diff_exits_non_zero_and_writes_nothing(tmp_path):
    repo = make_repo(tmp_path)
    out, cov = tmp_path / "out", tmp_path / "coverage.json"
    with pytest.raises(SystemExit) as exc:
        ri.build_input(str(repo), "origin/no-such-branch", "", out, cov)
    assert exc.value.code
    assert not cov.exists() and not out.exists()


def test_the_coverage_file_names_only_the_first_omitted_paths(tmp_path):
    repo = make_repo(tmp_path)
    for i in range(ri.COVERAGE_NAMES + 5):
        (repo / "backend" / f"f{i:02}.py").write_text("x\n")
    git(repo, "add", "-A")
    git(repo, "commit", "-qm", "many")
    out, cov = tmp_path / "out", tmp_path / "coverage.json"
    ri.build_input(str(repo), "main", "", out, cov, budget=0)
    data = json.loads(cov.read_text())
    assert data["total"] == ri.COVERAGE_NAMES + 6 and len(data["omitted"]) == ri.COVERAGE_NAMES
    assert len((out / "pr.omitted.txt").read_text().splitlines()) == data["total"]
