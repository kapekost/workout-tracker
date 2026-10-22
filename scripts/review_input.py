#!/usr/bin/env python3
"""Build the diff the reviewer reads, and the coverage record the poster prints.

    python3 review_input.py <base-ref> <last-reviewed-sha-or-empty> <out-dir> <coverage-file>

Run from the repository checkout. Writes into <out-dir>: pr.diff (the diff to review; its first
line says whether it is the whole PR or the changes since the last review), pr.full.diff (the
whole PR, for context), pr.stat and pr.omitted.txt. <coverage-file> is written outside the
checkout.

Binary files and lockfiles are left out. The rest is ordered so shipped and security-relevant
code comes first and tests and docs last, then filled up to a byte budget. A file that does not
fit is listed as omitted and the model may read it by path. Coverage is stated here, not by the
model, so it cannot be overstated.
"""
import json
import os
import re
import subprocess
import sys
from pathlib import Path

BUDGET = 60_000
LOCKFILES = ("package-lock.json",)
SHA = re.compile(r"[0-9a-f]{40}")
TEST_FILE = re.compile(
    r"(^|/)(test_[^/]*\.py|[^/]*_test\.py|[^/]*\.(test|spec)\.[jt]sx?|tests?/|__tests__/|e2e/)")
ESCAPES = {b"t": b"\t", b"n": b"\n", b'"': b'"', b"\\": b"\\"}


def classify(path):
    """Read order: 0 workflows, scripts and Dockerfiles, 1 backend, 2 frontend source, 3 tests,
    4 the rest."""
    if path.startswith((".github/", "scripts/")) or os.path.basename(path).startswith("Dockerfile"):
        return 0
    if TEST_FILE.search(path):
        return 3
    if path.startswith("backend/"):
        return 1
    if path.startswith("frontend/src/"):
        return 2
    return 4


def is_excluded(path, is_binary):
    return is_binary or os.path.basename(path) in LOCKFILES


def unquote(name):
    """Undo git's C-style quoting of a path."""
    if not (len(name) >= 2 and name[0] == name[-1] == '"'):
        return name

    def one(m):
        code = m.group(1)
        return bytes([int(code, 8)]) if code[:1].isdigit() else ESCAPES.get(code, code)

    raw = re.sub(rb"\\([0-7]{3}|.)", one, name[1:-1].encode("utf-8"))
    return raw.decode("utf-8", "replace")


def chunk_path(chunk):
    """The new path of one `diff --git` chunk. A rename names it on a `rename to` line; otherwise
    both sides carry the same path, so the header splits in half even when the path has spaces."""
    lines = chunk.split("\n")
    for line in lines[1:]:
        if line.startswith("rename to "):
            return unquote(line[len("rename to "):])
        if line.startswith(("--- ", "+++ ", "@@")):
            break
    rest = lines[0][len("diff --git "):]
    half = (len(rest) - 1) // 2
    second = unquote(rest[half + 1:])
    return second[2:] if second.startswith("b/") else second


def split_diff(text):
    """(path, chunk) per file. A content line always starts with space, + or -, so a line
    starting `diff --git ` is always a header."""
    chunks = re.split(r"(?m)^(?=diff --git )", text)
    return [(chunk_path(c), c) for c in chunks if c.startswith("diff --git ")]


def is_binary(chunk):
    return bool(re.search(r"(?m)^(Binary files .* differ|GIT binary patch)$", chunk))


def pick(chunks, budget):
    """Fill the budget in order. A file that does not fit is omitted, whole, and the walk goes on."""
    kept, omitted, used = [], [], 0
    for path, text in chunks:
        size = len(text.encode("utf-8"))
        if used + size <= budget:
            kept.append((path, text))
            used += size
        else:
            omitted.append(path)
    return kept, omitted


def ordered(text):
    """The text files of a diff in read order (git's order within a rank), and none of the rest."""
    files = [(p, c) for p, c in split_diff(text) if not is_excluded(p, is_binary(c))]
    return sorted(files, key=lambda pc: classify(pc[0]))


def select(text, budget):
    """(shown, total, omitted paths) for a diff."""
    files = ordered(text)
    shown, omitted = pick(files, budget)
    return shown, len(files), omitted


def delta_diff(last, head, full_len, run):
    """The diff from the last review to head, or None when the full diff should be used: last is
    not a full SHA, is not an ancestor of head (force push), or the delta is empty or no
    smaller than the full diff. run takes git arguments and returns stdout, or None on failure."""
    if not (SHA.fullmatch(last) and SHA.fullmatch(head)):
        return None
    if run(["merge-base", "--is-ancestor", last, head]) is None:
        return None
    delta = run(["diff", "--no-color", last, head])
    if delta is None or not delta.strip() or len(delta) >= full_len:
        return None
    return delta


def build_input(repo, base, last, out_dir, coverage_path, budget=BUDGET):
    def run(args):
        r = subprocess.run(["git", "-C", str(repo), *args], capture_output=True, text=True,
                           encoding="utf-8", errors="replace")
        return r.stdout if r.returncode == 0 else None

    full = run(["diff", "--no-color", f"{base}...HEAD"]) or ""
    head = (run(["rev-parse", "HEAD"]) or "").strip()
    delta = delta_diff(last, head, len(full), run)
    if delta is None:
        text, mode, since = full, "full", ""
        rng = [f"{base}...HEAD"]
        title = "# Whole PR"
    else:
        text, mode, since = delta, "incremental", last[:7]
        rng = [last, head]
        title = f"# Changes since {since}"

    shown, total, omitted = select(text, budget)
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    (out / "pr.diff").write_text(title + "\n" + "".join(c for _, c in shown), encoding="utf-8")
    (out / "pr.full.diff").write_text("".join(c for _, c in ordered(full)), encoding="utf-8")
    (out / "pr.stat").write_text(run(["diff", "--stat=200", *rng]) or "", encoding="utf-8")
    (out / "pr.omitted.txt").write_text("".join(p + "\n" for p in omitted), encoding="utf-8")
    Path(coverage_path).write_text(json.dumps(
        {"mode": mode, "since": since, "shown": len(shown), "total": total, "omitted": omitted}),
        encoding="utf-8")


def main(argv):
    if len(argv) != 5 or argv[1].startswith("-"):
        print(__doc__, file=sys.stderr)
        return 2
    base, last, out_dir, coverage_path = argv[1:]
    build_input(".", base, last if SHA.fullmatch(last) else "", out_dir, coverage_path)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
