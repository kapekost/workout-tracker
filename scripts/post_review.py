#!/usr/bin/env python3
"""Turn the reviewer's output into one GitHub review, or one plain comment.

The reviewer holds no token and its output is derived from attacker-controlled PR
text, so this script treats it as untrusted: it parses, validates, caps and escapes
it before anything is posted. It runs from the default branch, never from the PR.

    python3 post_review.py <pr> <owner/repo> <head-sha> <review-file>
    python3 post_review.py --check-verdict <review-file>

The second form only reports, through its exit status, whether the file holds a verdict
(0) or not (1). It makes no network call and runs no process.

Output that is not the expected JSON is posted inside a code block, truncated.

The script, not the model, chooses the review state. Critical and major findings request
changes, and only a review with no findings, notes or set-aside items approves; anything else
comments. GitHub may refuse a state, in which case the body is posted as a comment with a
line saying so.
"""
import json
import os
import re
import subprocess
import sys
from typing import NamedTuple

MAX_FINDINGS = 20
MAX_BODY = 400
MAX_SUMMARY = 200
MAX_PLAIN = 3000
MAX_INPUT = 50_000
MAX_DEFERRED = 3
ROUND_CAP = 2
BOT_LOGIN = "github-actions[bot]"
SEVERITIES = ("critical", "major", "minor")
ROUND_MARKER = re.compile(r"<!-- review-round:\d+ -->\s*$")

SECRET = re.compile(r"sk-or-|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_|Bearer [A-Za-z0-9._-]{20,}")
WITHHELD = ("**Automated review withheld.** The output matched a secret pattern "
            "and was not posted. See the Actions log for the run.")
FENCE = "`" * 3


def sanitize(text, repo, limit):
    """URLs and HTML are removed, @mentions are broken, and brackets, angle brackets,
    ampersands, # and backslashes are escaped, so nothing renders as a link, image,
    mention or cross-reference. Runs of three or more backticks or tildes are defused so a body
    cannot open a code block."""
    text = str(text)[:limit * 4]
    text = re.sub(r"<[^>]{0,200}>", "", text)
    text = re.sub(r"[\u202a-\u202e\u2066-\u2069]", "", text)
    text = re.sub(r"\b\w+://\S+|\bwww\.\S+", "[link removed]", text, flags=re.I)
    text = " ".join(text.split())[:limit]
    text = re.sub(r"@(?=\w)", "@​", text)
    text = re.sub(r"`{3,}|~{3,}", "'''", text)
    return re.sub(r"([\\\[\]<>&#])", r"\\\1", text)


MAX_DECODE_FAILURES = 200
MAX_SEARCH_DEPTH = 8


def last_verdict(obj):
    """The last verdict in document order inside a decoded object, or None. Iterative and
    depth-capped, so a deeply nested input cannot exhaust the stack."""
    found = None
    stack = [(obj, 0)]
    while stack:
        node, depth = stack.pop()
        if is_verdict(node):
            found = node
        if depth >= MAX_SEARCH_DEPTH:
            continue
        if isinstance(node, dict):
            children = list(node.values())
        elif isinstance(node, list):
            children = node
        else:
            continue
        stack.extend((child, depth + 1) for child in reversed(children)
                     if isinstance(child, (dict, list)))
    return found


def extract_json(text):
    """The last JSON object whose "findings" is a list, or None. Bounded work.

    The last one, because a model may narrate an example of the shape before giving its
    real answer, and the answer comes last. The scan moves forward and skips past each
    object it decodes, so only a failed decode spends from the budget: a reply that
    restates many small objects before its answer cannot push the answer out of reach."""
    text = text[:MAX_INPUT]
    decoder = json.JSONDecoder()
    found = None
    failures = 0
    pos = text.find("{")
    while pos != -1 and failures < MAX_DECODE_FAILURES:
        try:
            obj, end = decoder.raw_decode(text, pos)
        except (ValueError, RecursionError):
            failures += 1
            pos = text.find("{", pos + 1)
            continue
        verdict = last_verdict(obj)
        if verdict is not None:
            found = verdict
        pos = text.find("{", end)
    return found


def is_verdict(obj):
    """A findings list plus a real summary. An echo of the prompt's example shape has a
    placeholder summary such as "<one line, max 150 chars>", "..." or "-", and is not a
    verdict. A real summary has at least one word character."""
    if not isinstance(obj, dict) or not isinstance(obj.get("findings"), list):
        return False
    summary = obj.get("summary")
    return (isinstance(summary, str) and re.search(r"\w", summary) is not None
            and not summary.lstrip().startswith("<"))


def plain_comment(text):
    """Unstructured output goes inside a code block, where nothing renders or notifies."""
    text = text[:MAX_PLAIN].replace(FENCE, "'''")
    return f"**Automated review output (not structured, shown as text)**\n\n{FENCE}text\n{text}\n{FENCE}"


def commentable_lines(patch):
    """New-side line numbers that a review comment may anchor to (RIGHT side)."""
    lines = set()
    new = 0
    for row in (patch or "").split("\n"):
        hunk = re.match(r"@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@", row)
        if hunk:
            new = int(hunk.group(1))
            continue
        if row.startswith("-") or row.startswith("\\"):
            continue
        if new:
            lines.add(new)
            new += 1
    return lines


def is_line(value):
    return isinstance(value, int) and not isinstance(value, bool)


class Built(NamedTuple):
    kind: str          # "review" is posted as a review, "plain" as an issue comment
    body: str
    comments: list
    event: str         # REQUEST_CHANGES, APPROVE or COMMENT
    counts: dict       # critical, major (still counted), minor, dropped (malformed)
    demoted: int       # majors set aside by the round cap
    skipped: bool


def severity_of(finding):
    """A valid "severity" wins. Without one, "blocking": true is major and anything else is
    minor. A severity outside the three words is treated as absent."""
    sev = finding.get("severity")
    if isinstance(sev, str) and sev.strip().lower() in SEVERITIES:
        return sev.strip().lower()
    return "major" if finding.get("blocking") is True else "minor"


def decide_event(counts, kind, demoted, has_notes):
    """The review state. kind is "review" only for a structured, non-skipped review; a skipped
    notice, plain output and a withheld secret never approve. Approval needs a strictly clean
    review: no finding of any severity, none dropped or set aside by the round cap, and no
    note about something the reviewer could not verify."""
    if kind != "review":
        return "COMMENT"
    if counts["critical"] or counts["major"]:
        return "REQUEST_CHANGES"
    if counts["minor"] or counts["dropped"] or demoted or has_notes:
        return "COMMENT"
    return "APPROVE"


def plain_result(body):
    return Built("plain", body, [], "COMMENT",
                 {"critical": 0, "major": 0, "minor": 0, "dropped": 0}, 0, False)


def build(text, patches, repo, round_n=1):
    """Turns the reviewer's output into a Built. round_n is this review's round on the PR;
    past ROUND_CAP only critical findings still request changes."""
    if SECRET.search(text):
        return plain_result(WITHHELD)
    data = extract_json(text)
    if data is None:
        return plain_result(plain_comment(text) if text.strip() else "The reviewer produced no output.")
    if SECRET.search(json.dumps(data, ensure_ascii=False)):
        return plain_result(WITHHELD)

    findings = data.get("findings")
    if not isinstance(findings, list):
        findings = []
    valid = []
    dropped = 0
    for f in findings:
        if not isinstance(f, dict):
            dropped += 1
            continue
        path = f.get("file")
        body = sanitize(f.get("body", ""), repo, MAX_BODY)
        if not body or not isinstance(path, str):
            dropped += 1
            continue
        valid.append((SEVERITIES.index(severity_of(f)), path, f.get("line"), body))
    # Sorted before the cap, so a pile of minor findings cannot push a critical one out.
    valid.sort(key=lambda row: row[0])

    capped = round_n > ROUND_CAP
    counts = {"critical": 0, "major": 0, "minor": 0, "dropped": dropped}
    demoted = 0
    for rank, *_ in valid:
        if SEVERITIES[rank] == "major" and capped:
            demoted += 1
        else:
            counts[SEVERITIES[rank]] += 1
    blocking_lines, demoted_lines, minor_lines, comments = [], [], [], []
    for rank, path, line, body in valid[:MAX_FINDINGS]:
        sev = SEVERITIES[rank]
        shown = sanitize(path, repo, 120)
        where = f"{shown}:{line}" if is_line(line) else shown
        if sev == "major" and capped:
            demoted_lines.append(f"- {where} {body} (past the round cap)")
        elif sev == "minor":
            minor_lines.append(f"- {where} {body}")
        elif is_line(line) and path in patches and line in commentable_lines(patches[path]):
            comments.append({"path": path, "line": line, "side": "RIGHT", "body": body})
        else:
            blocking_lines.append(f"- {where} {body}")

    skipped = data.get("skipped") is True and not findings
    kind = "skipped" if skipped else "review"
    notes = data.get("notes")
    clean_notes = ([sanitize(n, repo, MAX_BODY) for n in notes[:5] if isinstance(n, str)]
                   if isinstance(notes, list) else [])
    event = decide_event(counts, kind, demoted, bool(notes))

    summary = sanitize(data.get("summary", ""), repo, MAX_SUMMARY)
    summary = re.sub(r"^(CLEAN|BLOCKING)\b[\s:.\-]*", "", summary)
    if skipped:
        head = f"**Automated review skipped.** {summary}".strip()
    elif event == "REQUEST_CHANGES":
        head = f"**BLOCKING** {summary}".strip()
    else:
        head = f"**CLEAN** {summary}".strip()
    parts = [head]
    if blocking_lines:
        parts += ["", "**Blocking (not on a changed line)**"] + blocking_lines
    deferred_lines = demoted_lines + minor_lines
    deferred_total = counts["minor"] + demoted
    if deferred_lines:
        shown_lines = deferred_lines[:MAX_DEFERRED]
        parts += ["", "**Deferred**"] + shown_lines
        if deferred_total > len(shown_lines):
            parts.append(f"- and {deferred_total - len(shown_lines)} more not shown")
    if clean_notes:
        parts += ["", "**Notes**"] + [f"- {n}" for n in clean_notes]
    return Built("review", "\n".join(parts), comments, event, counts, demoted, skipped)


def gh(args, payload=None):
    cmd = ["gh", "api"] + args
    if payload is not None:
        cmd += ["--input", "-"]
    return subprocess.run(cmd, input=json.dumps(payload) if payload is not None else None,
                          capture_output=True, text=True)


def pr_patches(repo, pr):
    out = subprocess.run(["gh", "api", "--paginate", f"repos/{repo}/pulls/{pr}/files",
                          "--jq", ".[] | {filename, patch}"],
                         capture_output=True, text=True)
    patches = {}
    if out.returncode != 0:
        return patches
    for row in out.stdout.splitlines():
        try:
            obj = json.loads(row)
        except ValueError:
            continue
        patches[obj["filename"]] = obj.get("patch") or ""
    return patches


def check_verdict(path):
    try:
        with open(path, encoding="utf-8", errors="replace") as fh:
            text = fh.read(MAX_INPUT)
    except OSError as exc:
        print(f"cannot read {path}: {exc}", file=sys.stderr)
        return 1
    return 0 if extract_json(text) is not None else 1


def signed(body, model, repo):
    """Names the model that produced the review; a skipped run has none."""
    return f"{body}\n\n_Reviewed by `{sanitize(model, repo, 80)}`_" if model else body


def pr_reviews(repo, pr):
    """The PR's reviews as dicts with id, state, commit_id, login and body, or None when GitHub cannot be
    asked. The login is an API field, not review text, so model output cannot set it."""
    out = subprocess.run(["gh", "api", "--paginate", f"repos/{repo}/pulls/{pr}/reviews",
                          "--jq", ".[] | {id, state, commit_id, login: .user.login, body}"],
                         capture_output=True, text=True)
    if out.returncode != 0:
        print(f"could not list reviews: {out.stderr.strip()}", file=sys.stderr)
        return None
    reviews = []
    for row in out.stdout.splitlines():
        try:
            obj = json.loads(row)
        except ValueError:
            continue
        if isinstance(obj, dict):
            reviews.append(obj)
    return reviews


def review_round(reviews):
    """This review's round: the bot's earlier marked reviews plus one. Skipped notices and
    plain output carry no marker, so a provider failure does not use up a round."""
    prior = [r for r in reviews or []
             if r.get("login") == BOT_LOGIN and ROUND_MARKER.search(str(r.get("body") or ""))]
    return len(prior) + 1


def refused(r):
    return r.returncode != 0 and "HTTP 422" in (r.stderr + r.stdout)


def with_note(body, note):
    """Adds a paragraph before the round marker, which must stay the last line or the round
    is not counted."""
    marker = ROUND_MARKER.search(body)
    if not marker:
        return f"{body}\n\n{note}"
    return f"{body[:marker.start()].rstrip()}\n\n{note}\n\n{marker.group().strip()}"


def post_review(repo, pr, head_sha, body, comments, event):
    """Posts the review and returns (result, event actually posted). GitHub answers 422 both
    for a state it refuses (APPROVE while Actions may not approve, REQUEST_CHANGES on the
    bot's own PR) and for an inline line it cannot place, so a refusal tries the lesser
    change first: the same state with the comments folded into the body, then COMMENT with
    the comments, then COMMENT with them folded. A review that ends in a different state says
    so in its body and in a workflow warning."""
    url = f"repos/{repo}/pulls/{pr}/reviews"

    def attempt(ev, cs, text):
        return gh([url, "-X", "POST"],
                  {"commit_id": head_sha, "event": ev, "body": text, "comments": cs})

    folded_body = body
    if comments:
        folded = [f"- {sanitize(c['path'], repo, 120)}:{c['line']} {c['body']}" for c in comments]
        folded_body = with_note(body, "**Blocking**\n" + "\n".join(folded))
    refusal = f"_Posted as COMMENT because GitHub refused {event}._"
    tries = [(event, comments, body)]
    if comments:
        tries.append((event, [], folded_body))
    if event != "COMMENT":
        tries.append(("COMMENT", comments, with_note(body, refusal)))
        if comments:
            tries.append(("COMMENT", [], with_note(folded_body, refusal)))
    for i, (ev, cs, text) in enumerate(tries):
        r = attempt(ev, cs, text)
        if not refused(r) or i == len(tries) - 1:
            if r.returncode == 0 and ev != event:
                print(f"::warning::GitHub refused {event}, the review was posted as {ev}")
            return r, ev
        print(f"GitHub refused {ev} ({len(cs)} inline), trying a lesser form: "
              f"{(r.stderr + r.stdout).strip()}", file=sys.stderr)


def dismiss_stale(repo, pr, head_sha, reviews):
    """Dismisses the bot's CHANGES_REQUESTED reviews of earlier commits. A review of the
    current head stands. Failure is a warning, never fatal."""
    short = re.sub(r"[^0-9a-fA-F]", "", head_sha)[:7]
    for rev in reviews or []:
        if (rev.get("login") != BOT_LOGIN or rev.get("state") != "CHANGES_REQUESTED"
                or rev.get("commit_id") == head_sha):
            continue
        r = gh([f"repos/{repo}/pulls/{pr}/reviews/{rev.get('id')}/dismissals", "-X", "PUT"],
               {"message": f"Superseded by a clean re-review of {short}.", "event": "DISMISS"})
        if r.returncode != 0:
            print(f"::warning::could not dismiss review {rev.get('id')}: {r.stderr.strip()}")


def main(argv):
    if len(argv) == 3 and argv[1] == "--check-verdict":
        return check_verdict(argv[2])
    if len(argv) != 5:
        print(__doc__, file=sys.stderr)
        return 2
    pr, repo, head_sha, path = argv[1:]
    with open(path, encoding="utf-8", errors="replace") as fh:
        text = fh.read(200_000)

    structured = extract_json(text) is not None
    patches = pr_patches(repo, pr) if structured else {}
    reviews = pr_reviews(repo, pr) if structured else None
    round_n = review_round(reviews)
    built = build(text, patches, repo, round_n)
    body = built.body
    if built.kind == "plain":
        r = gh([f"repos/{repo}/issues/{pr}/comments", "-X", "POST"], {"body": body})
        print("posted plain comment" if r.returncode == 0 else r.stderr, file=sys.stderr)
        return r.returncode

    body = signed(body, os.environ.get("REVIEW_MODEL", ""), repo)
    if not built.skipped:
        body += f"\n\n<!-- review-round:{round_n} -->"
    r, event = post_review(repo, pr, head_sha, body, built.comments, built.event)
    print(f"posted review as {event} (round {round_n})" if r.returncode == 0 else r.stderr,
          file=sys.stderr)
    if r.returncode == 0 and built.event == "APPROVE":
        dismiss_stale(repo, pr, head_sha, reviews)
    return r.returncode


if __name__ == "__main__":
    sys.exit(main(sys.argv))
