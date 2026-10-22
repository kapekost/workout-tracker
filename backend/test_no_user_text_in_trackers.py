"""Coach text must never reach GitHub: no script or workflow may handle both."""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TRACKER = re.compile(r"\bgh (issue|pr|api|project)\b|api\.github\.com")
COACH = re.compile(r"coach", re.I)


def offenders(files):
    return [f.name for f in files if (t := f.read_text()) and TRACKER.search(t) and COACH.search(t)]


def test_no_script_or_workflow_handles_coach_text_and_posts_to_github():
    files = [p for d in ("scripts", ".github/workflows") for p in (ROOT / d).glob("*") if p.suffix in {".sh", ".py", ".yml"}]
    assert files
    assert offenders(files) == []


def test_the_check_fails_on_a_deliberate_violation(tmp_path):
    bad = tmp_path / "post_coach_notes.sh"
    bad.write_text('gh issue comment 1 --body "$(sqlite3 db "select note from coach_requests")"\n')
    ok = tmp_path / "list_issues.sh"
    ok.write_text("gh issue list\n")
    assert offenders([bad, ok]) == ["post_coach_notes.sh"]
