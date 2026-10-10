"""scripts/task_cleanup.sh: idempotent per-task cleanup."""
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


def run_cleanup(repo_path, issue_num):
    """Run task_cleanup.sh and return combined output (stdout + stderr) and exit code."""
    script = Path(__file__).resolve().parent.parent / "scripts" / "task_cleanup.sh"
    result = subprocess.run(
        ["bash", str(script), str(issue_num)],
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
    run_git("init", cwd=repo)
    run_git("config", "user.email", "test@example.com", cwd=repo)
    run_git("config", "user.name", "Test User", cwd=repo)

    # Create initial commit
    (repo / "README.md").write_text("# Test\n")
    run_git("add", "README.md", cwd=repo)
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

        # Create venv and node_modules in the worktree
        venv_path = worktree_path / ".venv"
        venv_path.mkdir(parents=True)
        (venv_path / "dummy").write_text("venv file")

        node_path = worktree_path / "node_modules"
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

        # Verify output contains action lines
        lines = output.split("\n")
        assert len(lines) > 0, f"Should print action lines, got: {output}"


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

        # Output should indicate what was skipped/not found
        # No error for missing worktree/branch


def test_dirty_worktree_is_refused():
    """Test case 3: worktree with uncommitted changes should be refused."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_path = Path(tmp_dir)
        repo = make_test_repo(tmp_path)
        issue_num = 44

        # Create worktree and branch
        worktree_path, branch = make_task_worktree(repo, issue_num)

        # Create uncommitted changes
        (worktree_path / "dirty.txt").write_text("uncommitted")

        # Try to cleanup (should fail)
        output, returncode = run_cleanup(repo, issue_num)

        # Should refuse with non-zero exit code
        assert returncode != 0, f"Should refuse dirty worktree, output: {output}"
        # Git worktree remove will catch the dirty state and report it
        assert "uncommitted" in output.lower() or "dirty" in output.lower() or "changes" in output.lower() \
            or "modified" in output.lower() or "untracked" in output.lower(), \
            f"Should mention why it refused, got: {output}"

        # Worktree should still exist
        assert worktree_path.exists(), "Worktree should not be removed when refusing"


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
        assert "merge" in output.lower() or "unmerged" in output.lower(), \
            f"Should mention the merge status, got: {output}"

        # Worktree and branch should still exist
        assert worktree_path.exists(), "Worktree should not be removed when refusing"
        branches = run_git("branch", "-a", cwd=repo)
        assert f"implement/issue-{issue_num}" in branches
