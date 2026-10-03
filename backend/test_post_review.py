"""scripts/post_review.py: the reviewer's output is untrusted, so each rule is pinned."""
import importlib.util
import json
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "post_review", Path(__file__).resolve().parent.parent / "scripts" / "post_review.py")
pr = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pr)

REPO = "kapekost/workout-tracker"
PATCH = "@@ -1,3 +10,4 @@\n ctx\n-old\n+new\n+added\n ctx2"
PATCHES = {"a.py": PATCH}


def review(findings, **extra):
    return json.dumps({"summary": "s", "findings": findings, **extra})


def test_commentable_lines_are_new_side_only():
    assert pr.commentable_lines(PATCH) == {10, 11, 12, 13}
    assert pr.commentable_lines("") == set()
    assert pr.commentable_lines(None) == set()


def test_blocking_finding_on_a_changed_line_becomes_an_inline_comment():
    kind, body, comments = pr.build(
        review([{"file": "a.py", "line": 11, "blocking": True, "body": "breaks"}]), PATCHES, REPO)
    assert kind == "review"
    assert comments == [{"path": "a.py", "line": 11, "side": "RIGHT", "body": "breaks"}]
    assert body.startswith("**BLOCKING**")


def test_line_outside_the_diff_falls_back_to_the_body_not_an_inline_comment():
    kind, body, comments = pr.build(
        review([{"file": "a.py", "line": 99, "blocking": True, "body": "breaks"}]), PATCHES, REPO)
    assert comments == []
    assert "`a.py:99` breaks" in body


def test_file_not_in_the_pr_is_never_anchored():
    _, _, comments = pr.build(
        review([{"file": "other.py", "line": 11, "blocking": True, "body": "x"}]), PATCHES, REPO)
    assert comments == []


def test_optional_findings_never_get_inline_comments_and_are_capped_at_three():
    findings = [{"file": "a.py", "line": 11, "blocking": False, "body": f"nit {i}"} for i in range(6)]
    _, body, comments = pr.build(review(findings), PATCHES, REPO)
    assert comments == []
    assert body.count("nit ") == 3
    assert body.startswith("**CLEAN**")


def test_findings_are_capped():
    findings = [{"file": "a.py", "line": 11, "blocking": True, "body": f"f{i}"} for i in range(50)]
    _, _, comments = pr.build(review(findings), PATCHES, REPO)
    assert len(comments) == pr.MAX_FINDINGS


def test_mentions_html_images_and_foreign_links_are_neutralised():
    text = pr.sanitize(
        "ping @someone <b>x</b> ![i](http://evil/x.png) see https://evil.example/a "
        f"and https://github.com/{REPO}/pull/1", REPO, 400)
    assert "@someone" not in text and "@​someone" in text
    assert "<b>" not in text and "![" not in text
    assert "evil" not in text
    assert f"https://github.com/{REPO}/pull/1" in text


def test_body_length_is_capped():
    _, _, comments = pr.build(
        review([{"file": "a.py", "line": 11, "blocking": True, "body": "x" * 5000}]), PATCHES, REPO)
    assert len(comments[0]["body"]) == pr.MAX_BODY


def test_malformed_findings_are_skipped_not_fatal():
    findings = ["str", None, {"file": 3, "body": "x"}, {"file": "a.py", "line": True, "blocking": True, "body": "y"},
                {"file": "a.py", "line": 11, "blocking": True, "body": ""}]
    kind, body, comments = pr.build(review(findings), PATCHES, REPO)
    assert kind == "review" and comments == []


def test_json_inside_prose_and_fences_is_found():
    payload = review([{"file": "a.py", "line": 10, "blocking": True, "body": "b"}])
    for text in (f"Here you go:\n```json\n{payload}\n```\nthanks", f"prefix {payload} suffix"):
        _, _, comments = pr.build(text, PATCHES, REPO)
        assert len(comments) == 1


def test_non_json_output_is_posted_as_truncated_plain_text():
    kind, body, comments = pr.build("**Automated review skipped.** nothing ran. " + "x" * 9000, {}, REPO)
    assert kind == "plain" and comments == []
    assert len(body) <= pr.MAX_PLAIN


def test_secret_in_output_is_withheld_whole():
    for leak in ("sk-or-v1-abc", "ghp_" + "a" * 25, "Bearer " + "a" * 30):
        kind, body, comments = pr.build(review([{"file": "a.py", "line": 11, "blocking": True, "body": leak}]),
                                        PATCHES, REPO)
        assert kind == "plain" and body == pr.WITHHELD and comments == []


def test_clean_review():
    kind, body, comments = pr.build(review([], summary="3 files, no findings"), PATCHES, REPO)
    assert kind == "review" and comments == []
    assert body.startswith("**CLEAN**")
