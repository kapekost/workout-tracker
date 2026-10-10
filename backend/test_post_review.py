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
    assert "a.py:99 breaks" in body


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


def test_mentions_html_images_and_links_are_neutralised():
    text = pr.sanitize(
        "ping @someone <b>x</b> ![i](http://evil/x.png) see https://evil.example/a and www.evil.example "
        f"also https://github.com/{REPO}/pull/1", REPO, 400)
    assert "@someone" not in text and "@\u200bsomeone" in text
    assert "<b>" not in text
    assert "evil" not in text
    assert "github.com" not in text


def test_link_and_reference_punctuation_is_escaped():
    text = pr.sanitize("[x](//evil.com) ![a][r] [r]: //e.com h&#116;tps://e.com owner/repo#12", REPO, 400)
    for ch in "[]&#":
        assert text.count(ch) == text.count("\\" + ch), (ch, text)


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
    assert body.startswith("**Automated review output")
    assert body.count("```") == 2
    assert pr.MAX_PLAIN <= len(body) <= pr.MAX_PLAIN + 200


def test_plain_output_cannot_close_its_own_code_block():
    _, body, _ = pr.build("text ```\n@someone [x](https://evil.example)", {}, REPO)
    assert body.count("```") == 2


def test_a_secret_hidden_behind_json_escapes_is_still_withheld():
    leak = json.dumps({"summary": "s", "findings": [{"file": "a.py", "line": 11, "blocking": True,
                                                    "body": "sk-or-v1-abc"}]}).replace("sk-or-", "\\u0073k-or-")
    assert "sk-or-" not in leak
    kind, body, _ = pr.build(leak, PATCHES, REPO)
    assert kind == "plain" and body == pr.WITHHELD


def test_pathological_input_is_bounded_and_does_not_raise():
    import time
    start = time.time()
    for text in ("{" * 200_000, '{"findings":' * 60_000, "{" * 5000 + "}" * 5000,
                 '{"a":' * 20_000 + "1" + "}" * 20_000):
        kind, _, _ = pr.build(text, {}, REPO)
        assert kind == "plain"
    assert time.time() - start < 5


def test_skipped_notice_is_marked_skipped_not_clean():
    notice = json.dumps({"skipped": True, "summary": "No model was available.", "findings": [],
                         "notes": ["model-a: rate limited"]})
    kind, body, comments = pr.build(notice, {}, REPO)
    assert kind == "review" and comments == []
    assert body.startswith("**Automated review skipped.**")
    assert "CLEAN" not in body


def test_secret_in_output_is_withheld_whole():
    for leak in ("sk-or-v1-abc", "ghp_" + "a" * 25, "Bearer " + "a" * 30):
        kind, body, comments = pr.build(review([{"file": "a.py", "line": 11, "blocking": True, "body": leak}]),
                                        PATCHES, REPO)
        assert kind == "plain" and body == pr.WITHHELD and comments == []


def test_a_verdict_word_already_in_the_summary_is_not_repeated():
    _, body, _ = pr.build(review([], summary="CLEAN 3 files, no findings"), PATCHES, REPO)
    assert body == "**CLEAN** 3 files, no findings"


def test_the_last_findings_object_wins_over_an_example_before_it():
    real = {"summary": "s", "findings": [{"file": "a.py", "line": 11, "blocking": True, "body": "breaks"}]}
    text = 'The shape is {"summary": "x", "findings": []}. My answer: ' + json.dumps(real)
    kind, body, comments = pr.build(text, PATCHES, REPO)
    assert len(comments) == 1 and body.startswith("**BLOCKING**")


def test_findings_that_is_not_a_list_is_not_a_verdict():
    kind, body, _ = pr.build('{"summary": "s", "findings": "none"}', PATCHES, REPO)
    assert kind == "plain" and "CLEAN" not in body


def test_an_echo_of_the_prompts_example_shape_is_not_a_verdict():
    echo = '{"summary": "<one line, max 150 chars>", "findings": [], "notes": []}'
    kind, body, _ = pr.build("The shape is " + echo, PATCHES, REPO)
    assert kind == "plain" and "CLEAN" not in body


def test_a_verdict_nested_in_another_object_is_found():
    nested = json.dumps({"review": {"summary": "s", "findings": [
        {"file": "a.py", "line": 11, "blocking": True, "body": "breaks"}]}})
    _, _, comments = pr.build(nested, PATCHES, REPO)
    assert len(comments) == 1


def test_clean_review():
    kind, body, comments = pr.build(review([], summary="3 files, no findings"), PATCHES, REPO)
    assert kind == "review" and comments == []
    assert body.startswith("**CLEAN**")


def test_scheme_and_host_matching_is_case_insensitive_and_covers_any_scheme():
    text = pr.sanitize("HTTPS://evil.example WWW.evil.example ftp://evil.example/x", REPO, 400)
    assert "evil" not in text.lower()


def test_bidi_controls_are_stripped():
    assert pr.sanitize("a‮b⁦c", REPO, 50) == "abc"


def test_a_model_cannot_hide_findings_behind_the_skipped_flag():
    payload = json.dumps({"skipped": True, "summary": "s", "findings": [
        {"file": "a.py", "line": 11, "blocking": True, "body": "breaks"}]})
    _, body, comments = pr.build(payload, PATCHES, REPO)
    assert len(comments) == 1
    assert body.startswith("**BLOCKING**")


def test_ordinary_code_prose_stays_readable():
    text = pr.sanitize("`$schema` in f(x) uses *bold* and snake_case: ok", REPO, 100)
    assert text == "`$schema` in f(x) uses *bold* and snake_case: ok"


def test_a_body_cannot_open_a_code_block():
    assert "```" not in pr.sanitize("```python\nboom", REPO, 100)
    assert "~~~" not in pr.sanitize("~~~\nboom", REPO, 100)
    assert pr.sanitize("`~` and ~~x~~", REPO, 100) == "`~` and ~~x~~"


def real_verdict(summary="real answer"):
    return json.dumps({"summary": summary, "findings": [
        {"file": "a.py", "line": 11, "blocking": True, "body": "breaks"}]})


def test_a_verdict_after_many_braces_is_still_found():
    text = "{}" * 60 + " my answer: " + real_verdict()
    kind, body, comments = pr.build(text, PATCHES, REPO)
    assert kind == "review" and len(comments) == 1
    assert body.startswith("**BLOCKING**")


def test_an_example_shaped_verdict_before_many_braces_does_not_win():
    example = json.dumps({"summary": "example only", "findings": []})
    text = example + " " + "{}" * 45 + " my answer: " + real_verdict("the real one")
    data = pr.extract_json(text)
    assert data["summary"] == "the real one"
    _, body, comments = pr.build(text, PATCHES, REPO)
    assert len(comments) == 1 and "the real one" in body


def test_a_placeholder_summary_of_dots_is_not_a_verdict():
    for placeholder in ("...", "…", "-", " . . . "):
        echo = json.dumps({"summary": placeholder, "findings": []})
        assert pr.extract_json("The shape is " + echo) is None, placeholder
        kind, body, _ = pr.build("The shape is " + echo, PATCHES, REPO)
        assert kind == "plain" and "CLEAN" not in body


def test_a_real_summary_with_punctuation_is_still_a_verdict():
    for summary in ("No issues.", "3 files -- all fine!", "…and nothing else", "(none)"):
        assert pr.extract_json(json.dumps({"summary": summary, "findings": []})) is not None, summary


def run_check(tmp_path, text):
    path = tmp_path / "review.txt"
    path.write_text(text, encoding="utf-8")
    return pr.main(["post_review.py", "--check-verdict", str(path)])


def test_check_verdict_exits_0_for_a_verdict_and_1_for_anything_else(tmp_path, monkeypatch):
    def no_subprocess(*args, **kwargs):
        raise AssertionError("--check-verdict must not run gh or any other process")
    monkeypatch.setattr(pr.subprocess, "run", no_subprocess)
    assert run_check(tmp_path, real_verdict()) == 0
    assert run_check(tmp_path, "Looks fine to me, no JSON here.") == 1
    assert run_check(tmp_path, "") == 1
    assert run_check(tmp_path, '{"summary": "<one line, max 150 chars>", "findings": []}') == 1
    assert run_check(tmp_path, '{"summary": "...", "findings": []}') == 1
    assert pr.main(["post_review.py", "--check-verdict", str(tmp_path / "missing.txt")]) == 1


def test_check_verdict_reads_at_most_max_input(tmp_path):
    late = " " * pr.MAX_INPUT + real_verdict()
    assert run_check(tmp_path, late) == 1


def test_other_argument_counts_still_print_usage_and_return_2(tmp_path):
    assert pr.main(["post_review.py"]) == 2
    assert pr.main(["post_review.py", "--check-verdict"]) == 2
    assert pr.main(["post_review.py", "--other", "file"]) == 2
    assert pr.main(["post_review.py", "--check-verdict", "a", "b"]) == 2


def test_check_verdict_agrees_with_extract_json_on_a_corpus(tmp_path):
    corpus = [
        review([]),
        review([{"file": "a.py", "line": 10, "blocking": True, "body": "b"}]),
        f"Here you go:\n```json\n{review([])}\n```\nthanks",
        f"prefix {review([])} suffix",
        "**Automated review skipped.** nothing ran. " + "x" * 9000,
        "text ```\n@someone [x](https://evil.example)",
        '{"summary": "s", "findings": "none"}',
        '{"summary": "<one line, max 150 chars>", "findings": [], "notes": []}',
        '{"summary": "...", "findings": []}',
        'The shape is {"summary": "x", "findings": []}. My answer: ' + real_verdict(),
        json.dumps({"review": {"summary": "s", "findings": []}}),
        json.dumps({"skipped": True, "summary": "No model.", "findings": [], "notes": ["n"]}),
        "{" * 200_000, '{"findings":' * 60_000, "{" * 5000 + "}" * 5000,
        '{"a":' * 20_000 + "1" + "}" * 20_000,
        "{}" * 60 + real_verdict(),
        "",
    ]
    for text in corpus:
        verdict = pr.extract_json(text) is not None
        assert (run_check(tmp_path, text) == 0) == verdict, text[:60]
        assert (pr.build(text, PATCHES, REPO)[0] == "review") == verdict, text[:60]


def test_a_review_is_signed_with_the_model_that_ran():
    assert pr.signed("body", "cohere/north-mini-code:free", REPO).endswith("_Reviewed by `cohere/north-mini-code:free`_")


def test_a_skipped_run_has_no_signature_and_the_model_name_is_sanitized():
    assert pr.signed("body", "", REPO) == "body"
    assert "<b>" not in pr.signed("body", "x<b>y [z](http://evil.example)", REPO)
