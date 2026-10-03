#!/usr/bin/env python3
"""Turn the reviewer's output into one GitHub review, or one plain comment.

The reviewer holds no token and its output is derived from attacker-controlled PR
text, so this script treats it as untrusted: it parses, validates, caps and scrubs
it before anything is posted. It runs from the base branch, never from the PR.

    python3 post_review.py <pr> <owner/repo> <head-sha> <review-file>

Output that is not the expected JSON (including the "review skipped" notice) is
posted as a scrubbed, truncated plain comment.
"""
import json
import re
import subprocess
import sys

MAX_FINDINGS = 20
MAX_BODY = 400
MAX_SUMMARY = 200
MAX_PLAIN = 3000

SECRET = re.compile(r"sk-or-|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_|Bearer [A-Za-z0-9._-]{20,}")
WITHHELD = ("**Automated review withheld.** The output matched a secret pattern "
            "and was not posted. See the Actions log for the run.")


def sanitize(text, repo, limit):
    """Plain text only: no mentions, images, HTML, or links off this repo."""
    text = str(text)
    text = re.sub(r"<[^>]*>", "", text)
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", text)
    own = f"https://github.com/{repo}/"
    text = re.sub(r"https?://[^\s)>\]]+",
                  lambda m: m.group(0) if m.group(0).startswith(own) else "[link removed]", text)
    text = re.sub(r"@(?=\w)", "@​", text)
    text = " ".join(text.split())
    return text[:limit]


def extract_json(text):
    """The first top-level JSON object in the text, or None."""
    fence = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.S)
    candidates = [fence.group(1)] if fence else []
    start = text.find("{")
    while start != -1:
        depth = 0
        in_str = False
        esc = False
        for i in range(start, len(text)):
            ch = text[i]
            if in_str:
                if esc:
                    esc = False
                elif ch == "\\":
                    esc = True
                elif ch == '"':
                    in_str = False
            elif ch == '"':
                in_str = True
            elif ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    candidates.append(text[start:i + 1])
                    break
        start = text.find("{", start + 1)
        if len(candidates) > 8:
            break
    for c in candidates:
        try:
            obj = json.loads(c)
        except ValueError:
            continue
        if isinstance(obj, dict) and "findings" in obj:
            return obj
    return None


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


def build(text, patches, repo):
    """Returns ("review", body, comments) or ("plain", body, [])."""
    if SECRET.search(text):
        return "plain", WITHHELD, []
    data = extract_json(text)
    if data is None:
        return "plain", sanitize(text, repo, MAX_PLAIN) or "The reviewer produced no output.", []

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
        anchored = (isinstance(line, int) and not isinstance(line, bool)
                    and path in patches and line in commentable_lines(patches[path]))
        if blocking and anchored:
            comments.append({"path": path, "line": line, "side": "RIGHT", "body": body})
            continue
        where = f"`{sanitize(path, repo, 120)}:{line}`" if isinstance(line, int) else f"`{sanitize(path, repo, 120)}`"
        (blocking_lines if blocking else optional_lines).append(f"- {where} {body}")

    summary = sanitize(data.get("summary", ""), repo, MAX_SUMMARY)
    blocking_total = len(comments) + len(blocking_lines)
    if blocking_total:
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
        clean = [sanitize(n, repo, MAX_BODY) for n in notes[:3] if isinstance(n, str)]
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

    kind, body, comments = build(text, pr_patches(repo, pr) if extract_json(text) else {}, repo)
    if kind == "plain":
        r = gh([f"repos/{repo}/issues/{pr}/comments", "-X", "POST"], {"body": body})
        print("posted plain comment" if r.returncode == 0 else r.stderr, file=sys.stderr)
        return r.returncode

    payload = {"commit_id": head_sha, "event": "COMMENT", "body": body, "comments": comments}
    r = gh([f"repos/{repo}/pulls/{pr}/reviews", "-X", "POST"], payload)
    if r.returncode != 0 and comments:
        # A line GitHub refuses must not lose the finding: fold the comments into the body.
        folded = [f"- `{c['path']}:{c['line']}` {c['body']}" for c in comments]
        payload = {"commit_id": head_sha, "event": "COMMENT",
                   "body": body + "\n\n**Blocking**\n" + "\n".join(folded), "comments": []}
        r = gh([f"repos/{repo}/pulls/{pr}/reviews", "-X", "POST"], payload)
    print("posted review" if r.returncode == 0 else r.stderr, file=sys.stderr)
    return r.returncode


if __name__ == "__main__":
    sys.exit(main(sys.argv))
