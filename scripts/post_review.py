#!/usr/bin/env python3
"""Turn the reviewer's output into one GitHub review, or one plain comment.

The reviewer holds no token and its output is derived from attacker-controlled PR
text, so this script treats it as untrusted: it parses, validates, caps and escapes
it before anything is posted. It runs from the default branch, never from the PR.

    python3 post_review.py <pr> <owner/repo> <head-sha> <review-file>

Output that is not the expected JSON is posted inside a code block, truncated.
"""
import json
import re
import subprocess
import sys

MAX_FINDINGS = 20
MAX_BODY = 400
MAX_SUMMARY = 200
MAX_PLAIN = 3000
MAX_INPUT = 50_000

SECRET = re.compile(r"sk-or-|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_|Bearer [A-Za-z0-9._-]{20,}")
WITHHELD = ("**Automated review withheld.** The output matched a secret pattern "
            "and was not posted. See the Actions log for the run.")
FENCE = "`" * 3


def sanitize(text, repo, limit):
    """URLs and HTML are removed, @mentions are broken, and brackets, angle brackets,
    ampersands, # and backslashes are escaped, so nothing renders as a link, image,
    mention or cross-reference. Backtick runs of three or more are defused so a body
    cannot open a code block."""
    text = str(text)[:limit * 4]
    text = re.sub(r"<[^>]{0,200}>", "", text)
    text = re.sub(r"[\u202a-\u202e\u2066-\u2069]", "", text)
    text = re.sub(r"\b\w+://\S+|\bwww\.\S+", "[link removed]", text, flags=re.I)
    text = " ".join(text.split())[:limit]
    text = re.sub(r"@(?=\w)", "@​", text)
    text = re.sub(r"`{3,}", "'''", text)
    return re.sub(r"([\\\[\]<>&#])", r"\\\1", text)


def extract_json(text):
    """The first JSON object with a "findings" key, or None. Bounded work."""
    text = text[:MAX_INPUT]
    decoder = json.JSONDecoder()
    pos = text.find("{")
    for _ in range(20):
        if pos == -1:
            return None
        try:
            obj, _end = decoder.raw_decode(text, pos)
        except (ValueError, RecursionError):
            pos = text.find("{", pos + 1)
            continue
        if isinstance(obj, dict) and "findings" in obj:
            return obj
        pos = text.find("{", pos + 1)
    return None


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


def build(text, patches, repo):
    """Returns ("review", body, comments) or ("plain", body, [])."""
    if SECRET.search(text):
        return "plain", WITHHELD, []
    data = extract_json(text)
    if data is None:
        return "plain", plain_comment(text) if text.strip() else "The reviewer produced no output.", []
    if SECRET.search(json.dumps(data, ensure_ascii=False)):
        return "plain", WITHHELD, []

    findings = data.get("findings")
    if not isinstance(findings, list):
        findings = []
    blocking_lines, optional_lines, comments = [], [], []
    for f in findings[:MAX_FINDINGS]:
        if not isinstance(f, dict):
            continue
        path = f.get("file")
        line = f.get("line")
        body = sanitize(f.get("body", ""), repo, MAX_BODY)
        if not body or not isinstance(path, str):
            continue
        blocking = f.get("blocking") is True
        anchored = is_line(line) and path in patches and line in commentable_lines(patches[path])
        if blocking and anchored:
            comments.append({"path": path, "line": line, "side": "RIGHT", "body": body})
            continue
        shown = sanitize(path, repo, 120)
        where = f"{shown}:{line}" if is_line(line) else shown
        (blocking_lines if blocking else optional_lines).append(f"- {where} {body}")

    summary = sanitize(data.get("summary", ""), repo, MAX_SUMMARY)
    if data.get("skipped") is True and not findings:
        head = f"**Automated review skipped.** {summary}".strip()
    elif comments or blocking_lines:
        head = f"**BLOCKING** {summary}".strip()
    else:
        head = f"**CLEAN** {summary}".strip()
    parts = [head]
    if blocking_lines:
        parts += ["", "**Blocking (not on a changed line)**"] + blocking_lines
    if optional_lines:
        parts += ["", "**Optional**"] + optional_lines[:3]
    notes = data.get("notes")
    if isinstance(notes, list):
        clean = [sanitize(n, repo, MAX_BODY) for n in notes[:5] if isinstance(n, str)]
        if clean:
            parts += ["", "**Notes**"] + [f"- {n}" for n in clean]
    return "review", "\n".join(parts), comments


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


def main(argv):
    if len(argv) != 5:
        print(__doc__, file=sys.stderr)
        return 2
    pr, repo, head_sha, path = argv[1:]
    with open(path, encoding="utf-8", errors="replace") as fh:
        text = fh.read(200_000)

    patches = pr_patches(repo, pr) if extract_json(text) else {}
    kind, body, comments = build(text, patches, repo)
    if kind == "plain":
        r = gh([f"repos/{repo}/issues/{pr}/comments", "-X", "POST"], {"body": body})
        print("posted plain comment" if r.returncode == 0 else r.stderr, file=sys.stderr)
        return r.returncode

    payload = {"commit_id": head_sha, "event": "COMMENT", "body": body, "comments": comments}
    r = gh([f"repos/{repo}/pulls/{pr}/reviews", "-X", "POST"], payload)
    if r.returncode != 0 and comments and "422" in (r.stderr + r.stdout):
        # GitHub refused a line: fold the comments into the body rather than lose them.
        folded = [f"- {sanitize(c['path'], repo, 120)}:{c['line']} {c['body']}" for c in comments]
        payload = {"commit_id": head_sha, "event": "COMMENT",
                   "body": body + "\n\n**Blocking**\n" + "\n".join(folded), "comments": []}
        r = gh([f"repos/{repo}/pulls/{pr}/reviews", "-X", "POST"], payload)
    print("posted review" if r.returncode == 0 else r.stderr, file=sys.stderr)
    return r.returncode


if __name__ == "__main__":
    sys.exit(main(sys.argv))
