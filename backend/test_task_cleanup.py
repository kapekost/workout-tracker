"""scripts/task_cleanup.sh: idempotent per-task cleanup."""
import shutil
import subprocess
import tempfile
from pathlib import Path


def run_git(*args, cwd=None):
    """Run git command and return stdout."""
    result = subprocess.run(
        ["git"] + list(args),
        cwd=cwd,
        capture_output=True,
        text=True,
        check=True
    )
    return result.stdout.strip()


def run_cleanup(repo_path, issue_num, *extra):
    """Run task_cleanup.sh and return combined output (stdout + stderr) and exit code."""
    script = Path(__file__).resolve().parent.parent / "scripts" / "task_cleanup.sh"
    result = subprocess.run(
        ["bash", str(script), str(issue_num), *extra],
        cwd=repo_path,
        capture_output=True,
        text=True
    )
    # Combine stdout and stderr for easier testing
    output = (result.stdout + result.stderr).strip()
    return output, result.returncode


def make_test_repo(tmp_path):
    """Create a test git repo with main branch and return the path."""
    repo = tmp_path / "test_repo"
    repo.mkdir()
    run_git("init", "-b", "main", cwd=repo)
    run_git("config", "user.email", "test@example.com", cwd=repo)
    run_git("config", "user.name", "Test User", cwd=repo)

    # Create initial commit
    (repo / "README.md").write_text("# Test\n")
    (repo / ".gitignore").write_text(".venv/\nnode_modules/\n")
    run_git("add", "README.md", ".gitignore", cwd=repo)
    run_git("commit", "-m", "initial", cwd=repo)

    return repo


def make_task_worktree(repo, issue_num):
    """Create a task worktree and branch for testing."""
    worktree_path = repo / ".claude" / "worktrees" / f"issue-{issue_num}"
    worktree_path.parent.mkdir(parents=True, exist_ok=True)

    branch = f"implement/issue-{issue_num}"
    run_git("worktree", "add", str(worktree_path), "-b", branch, cwd=repo)
    return worktree_path, branch


def test_everything_present_is_cleaned_up():
    """Test case 1: everything present, everything should be removed."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_path = Path(tmp_dir)
        repo = make_test_repo(tmp_path)
        issue_num = 42

        # Create worktree and branch
        worktree_path, branch = make_task_worktree(repo, issue_num)

        # Create venv and node_modules where this repo keeps them
        venv_path = worktree_path / "backend" / ".venv"
        venv_path.mkdir(parents=True)
        (venv_path / "dummy").write_text("venv file")

        node_path = worktree_path / "frontend" / "node_modules"
        node_path.mkdir(parents=True)
        (node_path / "dummy").write_text("node file")

        # Make a commit in the worktree
        (worktree_path / "test.txt").write_text("test content")
        run_git("add", "test.txt", cwd=worktree_path)
        run_git("commit", "-m", "test commit", cwd=worktree_path)

        # Merge the branch to main
        run_git("checkout", "main", cwd=repo)
        run_git("merge", "--no-ff", "-m", "merge test", branch, cwd=repo)

        # Verify setup
        assert worktree_path.exists(), "Worktree should exist before cleanup"
        assert (repo / ".claude" / "worktrees" / f"issue-{issue_num}").exists()

        # Run cleanup
        output, returncode = run_cleanup(repo, issue_num)

        # Verify cleanup
        assert returncode == 0, f"Cleanup should succeed, output: {output}"
        assert not worktree_path.exists(), "Worktree should be removed"
        assert not (repo / ".git" / "worktrees" / f"issue-{issue_num}").exists()

        # Check that branch was deleted
        branches = run_git("branch", "-a", cwd=repo)
        assert f"implement/issue-{issue_num}" not in branches

        assert "removed backend/.venv" in output
        assert "removed frontend/node_modules" in output
        assert "removed worktree" in output
        assert f"removed branch {branch}" in output


def test_everything_already_gone_is_idempotent():
    """Test case 2: everything already gone, should be idempotent."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_path = Path(tmp_dir)
        repo = make_test_repo(tmp_path)
        issue_num = 43

        # Run cleanup when nothing exists (idempotent)
        output, returncode = run_cleanup(repo, issue_num)

        # Should succeed even though nothing was cleaned
        assert returncode == 0, f"Should succeed on idempotent run, output: {output}"

        assert "worktree already gone" in output, f"Should say what it found, got: {output}"


def test_dirty_worktree_is_refused():
    """Test case 3: worktree with uncommitted changes should be refused."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_path = Path(tmp_dir)
        repo = make_test_repo(tmp_path)
        issue_num = 44

        # Create worktree and branch
        worktree_path, branch = make_task_worktree(repo, issue_num)

        # Create uncommitted changes and a venv that must survive the refusal
        (worktree_path / "dirty.txt").write_text("uncommitted")
        (worktree_path / "backend" / ".venv").mkdir(parents=True)

        # Try to cleanup (should fail)
        output, returncode = run_cleanup(repo, issue_num)

        # Should refuse with non-zero exit code
        assert returncode != 0, f"Should refuse dirty worktree, output: {output}"
        assert "uncommitted changes" in output, f"Should mention why it refused, got: {output}"

        # Nothing is deleted before the refusal
        assert worktree_path.exists(), "Worktree should not be removed when refusing"
        assert (worktree_path / "backend" / ".venv").exists(), "venv must survive a refusal"


def test_unmerged_branch_is_refused():
    """Test case 4: unmerged branch should be refused."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_path = Path(tmp_dir)
        repo = make_test_repo(tmp_path)
        issue_num = 45

        # Create worktree and branch but don't merge
        worktree_path, branch = make_task_worktree(repo, issue_num)

        # Make a commit in the worktree
        (worktree_path / "test.txt").write_text("test content")
        run_git("add", "test.txt", cwd=worktree_path)
        run_git("commit", "-m", "test commit", cwd=worktree_path)

        # Don't merge - leave it unmerged

        # Try to cleanup (should fail)
        output, returncode = run_cleanup(repo, issue_num)

        # Should refuse with non-zero exit code
        assert returncode != 0, f"Should refuse unmerged branch, output: {output}"
        assert "not shown to be merged" in output, f"Should mention the merge status, got: {output}"

        # Worktree and branch should still exist
        assert worktree_path.exists(), "Worktree should not be removed when refusing"
        branches = run_git("branch", "-a", cwd=repo)
        assert f"implement/issue-{issue_num}" in branches


def commit_in(path, name):
    (path / name).write_text(name)
    run_git("add", name, cwd=path)
    run_git("commit", "-m", name, cwd=path)


def add_origin(repo, tmp_path):
    """Give the repo an origin whose main it tracks, as a real checkout has."""
    origin = tmp_path / "origin.git"
    run_git("init", "--bare", "-b", "main", str(origin))
    run_git("remote", "add", "origin", str(origin), cwd=repo)
    run_git("push", "origin", "main", cwd=repo)
    run_git("fetch", "origin", cwd=repo)


def test_squash_merged_branch_is_cleaned_up():
    """The repo merges with --squash, so the branch is never an ancestor of main."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_path = Path(tmp_dir)
        repo = make_test_repo(tmp_path)
        add_origin(repo, tmp_path)
        worktree_path, branch = make_task_worktree(repo, 7)
        commit_in(worktree_path, "feature.txt")

        run_git("merge", "--squash", branch, cwd=repo)
        run_git("commit", "-m", "squashed", cwd=repo)
        run_git("push", "origin", "main", cwd=repo)
        run_git("fetch", "origin", cwd=repo)

        output, returncode = run_cleanup(repo, 7)

        assert returncode == 0, output
        assert not worktree_path.exists()
        assert f"removed branch {branch}" in output
        assert branch not in run_git("branch", cwd=repo)


def test_branch_is_read_from_the_worktree():
    """A task branch need not be named implement/issue-<n>."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        repo = make_test_repo(Path(tmp_dir))
        worktree_path = repo / ".claude" / "worktrees" / "issue-8"
        worktree_path.parent.mkdir(parents=True)
        run_git("worktree", "add", str(worktree_path), "-b", "implement/task-cleanup", cwd=repo)

        output, returncode = run_cleanup(repo, 8)

        assert returncode == 0, output
        assert "removed branch implement/task-cleanup" in output
        assert "implement/task-cleanup" not in run_git("branch", cwd=repo)


def test_run_from_inside_the_worktree_is_refused():
    with tempfile.TemporaryDirectory() as tmp_dir:
        repo = make_test_repo(Path(tmp_dir))
        worktree_path, _ = make_task_worktree(repo, 9)

        output, returncode = run_cleanup(worktree_path, 9)

        assert returncode != 0, output
        assert "main checkout" in output
        assert worktree_path.exists()


def test_worktree_gone_with_unmerged_branch_is_refused():
    with tempfile.TemporaryDirectory() as tmp_dir:
        repo = make_test_repo(Path(tmp_dir))
        worktree_path, branch = make_task_worktree(repo, 10)
        commit_in(worktree_path, "work.txt")
        run_git("worktree", "remove", str(worktree_path), cwd=repo)

        output, returncode = run_cleanup(repo, 10)

        assert returncode != 0, output
        assert "worktree already gone" in output
        assert "not shown to be merged" in output
        assert branch in run_git("branch", cwd=repo)


def test_worktree_gone_with_unlisted_branch_says_branch_unknown():
    """Never report a branch as gone when only a guessed name was checked."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        repo = make_test_repo(Path(tmp_dir))
        worktree_path = repo / ".claude" / "worktrees" / "issue-11"
        worktree_path.parent.mkdir(parents=True)
        run_git("worktree", "add", str(worktree_path), "-b", "implement/foo", cwd=repo)
        commit_in(worktree_path, "work.txt")
        run_git("worktree", "remove", str(worktree_path), cwd=repo)

        output, returncode = run_cleanup(repo, 11)

        assert returncode == 0, output
        assert "branch unknown" in output
        assert "branch already gone" not in output
        assert "implement/foo" in run_git("branch", cwd=repo)

        output, returncode = run_cleanup(repo, 11, "implement/foo")

        assert returncode != 0, output
        assert "not shown to be merged" in output
        assert "implement/foo" in run_git("branch", cwd=repo)


def test_unregistered_directory_is_refused_before_deleting():
    with tempfile.TemporaryDirectory() as tmp_dir:
        repo = make_test_repo(Path(tmp_dir))
        stray = repo / ".claude" / "worktrees" / "issue-12"
        (stray / "backend" / ".venv").mkdir(parents=True)

        output, returncode = run_cleanup(repo, 12)

        assert returncode != 0, output
        assert "not a registered worktree" in output
        assert (stray / "backend" / ".venv").exists()


def test_worktree_gone_does_not_unregister_other_worktrees():
    with tempfile.TemporaryDirectory() as tmp_dir:
        repo = make_test_repo(Path(tmp_dir))
        other_path, _ = make_task_worktree(repo, 3)
        commit_in(other_path, "work.txt")
        # A worktree whose directory looks missing, as when the repo is mounted elsewhere.
        moved = Path(tmp_dir) / "moved-issue-3"
        other_path.rename(moved)
        _, branch = make_task_worktree(repo, 9)
        shutil.rmtree(repo / ".claude" / "worktrees" / "issue-9")

        output, returncode = run_cleanup(repo, 9)

        assert returncode == 0, output
        assert "worktree already gone" in output
        listing = run_git("worktree", "list", "--porcelain", cwd=repo)
        assert "issue-3" in listing
        assert "issue-9" not in listing


def test_protected_branch_argument_is_refused():
    with tempfile.TemporaryDirectory() as tmp_dir:
        repo = make_test_repo(Path(tmp_dir))
        # Git itself would refuse to delete main while it is checked out here.
        run_git("checkout", "-b", "other", cwd=repo)

        output, returncode = run_cleanup(repo, 11, "main")

        assert returncode != 0, output
        assert "protected branch main" in output
        assert "main" in run_git("branch", cwd=repo)


def test_branch_checked_out_in_another_worktree_is_refused():
    with tempfile.TemporaryDirectory() as tmp_dir:
        repo = make_test_repo(Path(tmp_dir))
        elsewhere = Path(tmp_dir) / "elsewhere"
        run_git("worktree", "add", str(elsewhere), "-b", "feature/x", cwd=repo)

        output, returncode = run_cleanup(repo, 12, "feature/x")

        assert returncode != 0, output
        assert "checked out in another worktree" in output
        assert "feature/x" in run_git("branch", cwd=repo)
