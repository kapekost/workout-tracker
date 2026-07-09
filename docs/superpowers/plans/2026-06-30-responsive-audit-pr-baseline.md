# Responsive UI Audit + Personal-Best Baseline Fix — Implementation Plan

> **2026-07-09:** Part A executed and deployed (tests + code as written below, via feat/review-fixes). Part B NOT executed — trimmed and parked in the AGENTS.md backlog. Note the Global Constraints below predate the off-LAN release-asset deploy path, branch-per-feature flow, and the current test counts; refresh before executing anything else from here.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop first-ever entries from being celebrated as personal records (treat them as a silent baseline with a quiet note), and sweep every page for cut-off/overflow UI across the phone-to-tablet range.

**Architecture:** Part A is a self-contained change to the pure-computation `session_prs()` endpoint in the FastAPI backend, plus matching render logic in the React finish-summary. Part B is a manual browser sweep at fixed widths that produces an issue catalog, then targeted CSS/layout fixes verified by re-screenshotting.

**Tech Stack:** Backend — Python 3, FastAPI, SQLite, pytest + `fastapi.testclient`. Frontend — React 18, Vite, plain inline styles + `frontend/src/index.css`, recharts. Verification via Claude-in-Chrome browser automation.

## Global Constraints

- PRs are **not persisted** — `GET /api/sessions/{sid}/prs` computes them on the fly at session finish. No DB migration; no schema change.
- Backend deps are pinned: fastapi 0.138.1, uvicorn 0.49.0, pydantic 2.13.4. Do not add dependencies.
- App is a **portrait-locked** PWA, content column `max-width` 448px (`max-w-md`) / timer-bar `max-width` 480px. Audit portrait only.
- Single `main` branch, solo dev. Commit directly to `main`. No deployment automation.
- Deploy to the Pi is **manual and gated on SSH reachability** (off the home LAN, SSH is not exposed over Tailscale). The plan ends by recording the pending deploy, not performing it.
- Run the existing frontend test suite (`npm test` in `frontend/`) and backend tests (`pytest` in `backend/`) green before the final commit of each part.

---

## File map

| File | Responsibility | Part |
|---|---|---|
| `backend/main.py` (`session_prs`, ~L194-230) | Baseline-vs-PR computation | A |
| `backend/test_main.py` | New PR/baseline tests | A |
| `frontend/src/pages/Workout.jsx` (`prLabel` L59-66, summary block L140-148) | Render baseline vs PR in finish summary | A |
| `frontend/src/index.css` (`.timer-bar` L100-106, button rules) | Responsive fixes | B |
| `frontend/src/components/TimerBar.jsx` | Responsive fixes if structural | B |
| various pages/components | Responsive fixes from catalog | B |
| `docs/superpowers/audits/2026-06-30-responsive-catalog.md` (new) | Issue catalog deliverable | B |
| `AGENTS.md` (Status section) | Record pending deploy | final |

---

# PART A — Personal-best baseline fix

### Task A1: Backend `session_prs` — baseline instead of first-entry PR

**Files:**
- Modify: `backend/main.py` — `session_prs()` (currently ~L194-230)
- Test: `backend/test_main.py`

**Interfaces:**
- Consumes: existing endpoints `POST /api/sessions` → `{id}`, `POST /api/sessions/{sid}/sets` (body `{exercise_id, exercise_name, set_number, reps, weight_kg}`), `PATCH /api/sessions/{sid}` `{completed: true}`, `GET /api/sessions/{sid}/prs`.
- Produces: `GET /api/sessions/{sid}/prs` returns a list of dicts. PR entries: `{"type": "weight"|"reps"|"1rm"|"volume", "exercise_name": str|None, "value": number, "unit": str}`. **New** baseline entry: `{"type": "baseline", "exercise_name": str, "value": None, "unit": None}`. Part A2 (frontend) relies on the `"baseline"` type string.

- [ ] **Step 1: Write the failing tests**

Add to `backend/test_main.py`. These use the same `client` fixture pattern already in the file. Helper logs a completed session of single-set exercises.

```python
def _log_session(client, day, sets):
    """sets: list of (exercise_id, exercise_name, reps, weight_kg). Returns sid."""
    sid = client.post("/api/sessions", json={"workout_day": day}).json()["id"]
    for i, (eid, ename, reps, w) in enumerate(sets, start=1):
        client.post(f"/api/sessions/{sid}/sets", json={
            "exercise_id": eid, "exercise_name": ename,
            "set_number": i, "reps": reps, "weight_kg": w})
    client.patch(f"/api/sessions/{sid}", json={"completed": True})
    return sid

def test_first_ever_exercise_is_baseline_not_pr(client):
    sid = _log_session(client, "upper_a", [("bench", "Bench Press", 8, 60.0)])
    prs = client.get(f"/api/sessions/{sid}/prs").json()
    types = [p["type"] for p in prs]
    assert "baseline" in types
    assert "weight" not in types and "reps" not in types and "1rm" not in types
    baseline = next(p for p in prs if p["type"] == "baseline")
    assert baseline["exercise_name"] == "Bench Press"

def test_first_completed_session_has_no_volume_pr(client):
    sid = _log_session(client, "upper_a", [("bench", "Bench Press", 8, 60.0)])
    prs = client.get(f"/api/sessions/{sid}/prs").json()
    assert "volume" not in [p["type"] for p in prs]

def test_second_session_beating_baseline_is_a_pr(client):
    _log_session(client, "upper_a", [("bench", "Bench Press", 8, 60.0)])
    sid2 = _log_session(client, "upper_a", [("bench", "Bench Press", 8, 65.0)])
    prs = client.get(f"/api/sessions/{sid2}/prs").json()
    types = [p["type"] for p in prs]
    assert "weight" in types and "baseline" not in types
    weight = next(p for p in prs if p["type"] == "weight")
    assert weight["value"] == 65.0

def test_new_top_weight_gives_weight_pr_only_no_reps_pr(client):
    # Baseline at 60kg, then a brand-new top weight of 65kg.
    _log_session(client, "upper_a", [("bench", "Bench Press", 8, 60.0)])
    sid2 = _log_session(client, "upper_a", [("bench", "Bench Press", 5, 65.0)])
    prs = client.get(f"/api/sessions/{sid2}/prs").json()
    types = [p["type"] for p in prs]
    assert "weight" in types
    assert "reps" not in types  # no prior reps at 65kg to beat
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && python -m pytest test_main.py -k "baseline or volume_pr or beating_baseline or new_top_weight" -v`
Expected: FAIL — current code emits `weight`/`reps`/`1rm`/`volume` for the first session (no `baseline` type exists yet).

- [ ] **Step 3: Rewrite the PR computation block**

In `backend/main.py`, replace the per-exercise loop and volume check at the end of `session_prs` (everything from `prs = []` to `return prs`) with:

```python
    prs = []
    by_ex = {}
    for r in cur_sets:
        by_ex.setdefault(r["exercise_id"], {"name": r["exercise_name"], "sets": []})["sets"].append(r)
    for ex_id, info in by_ex.items():
        psets = [p for p in prior if p["exercise_id"] == ex_id]
        # No prior completed history for this exercise → baseline, not a PR.
        if not psets:
            prs.append({"type": "baseline", "exercise_name": info["name"], "value": None, "unit": None})
            continue
        cur_w = max(s["weight_kg"] for s in info["sets"])
        if cur_w > max(p["weight_kg"] for p in psets):
            prs.append({"type": "weight", "exercise_name": info["name"], "value": cur_w, "unit": "kg"})
        # reps at the session's top weight — only a PR if we've lifted this weight before
        cur_reps = max(s["reps"] for s in info["sets"] if s["weight_kg"] == cur_w)
        prior_reps_at_w = [p["reps"] for p in psets if p["weight_kg"] == cur_w]
        if prior_reps_at_w and cur_reps > max(prior_reps_at_w):
            prs.append({"type": "reps", "exercise_name": info["name"], "value": cur_reps, "unit": f"@{cur_w}kg"})
        cur_1rm = max(epley(s["weight_kg"], s["reps"]) for s in info["sets"])
        if cur_1rm > max(epley(p["weight_kg"], p["reps"]) for p in psets):
            prs.append({"type": "1rm", "exercise_name": info["name"], "value": cur_1rm, "unit": "kg"})

    cur_vol = sum(r["weight_kg"] * r["reps"] for r in cur_sets)
    prior_vols = [row["v"] for row in vol_rows if row["session_id"] != sid]
    if cur_vol and prior_vols and cur_vol > max(prior_vols):
        prs.append({"type": "volume", "exercise_name": None, "value": cur_vol, "unit": "kg"})
    return prs
```

The only changes vs. the original: the `if not psets` early-out appends a `baseline` and `continue`s; each remaining guard drops its `not psets or …` / `not prior_* or …` branch so a PR now requires prior data to beat.

- [ ] **Step 4: Run the new tests — verify they pass**

Run: `cd backend && python -m pytest test_main.py -k "baseline or volume_pr or beating_baseline or new_top_weight" -v`
Expected: PASS (4 passed).

- [ ] **Step 5: Run the full backend suite — verify no regression**

Run: `cd backend && python -m pytest -q`
Expected: all pass (existing tests in `test_main.py`, `test_history.py`, `test_notes.py` plus the 4 new ones).

- [ ] **Step 6: Commit**

```bash
git add backend/main.py backend/test_main.py
git commit -m "fix(backend): first entry sets a baseline, not a personal record

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task A2: Frontend finish-summary — render baseline quietly

**Files:**
- Modify: `frontend/src/pages/Workout.jsx` — `prLabel` (L59-66) and the summary `serverPrs.map` block (L140-148)

**Interfaces:**
- Consumes: `summary.serverPrs` array from `GET /api/sessions/{sid}/prs` (Task A1), including the new `{"type": "baseline", "exercise_name", ...}` entry.

- [ ] **Step 1: Add the baseline label**

In `prLabel`, add a baseline branch at the top of the function body (before the `weight` branch):

```javascript
function prLabel(p) {
  const who = p.exercise_name ? `${p.exercise_name} ` : ''
  if (p.type === 'baseline') return `${p.exercise_name} — baseline set`
  if (p.type === 'weight')  return `Highest ${who}weight: ${p.value}kg`
  if (p.type === 'reps')    return `Most ${who}reps ${p.unit}: ${p.value}`
  if (p.type === '1rm')     return `Highest ${who}est. 1RM: ${p.value}kg`
  if (p.type === 'volume')  return `Highest session volume: ${p.value.toLocaleString()}kg`
  return 'New record'
}
```

- [ ] **Step 2: Split baseline vs PR rendering in the summary**

Replace the `serverPrs.map` block (currently every entry renders gold with `🎉 New PR —`):

```jsx
{summary.serverPrs?.length > 0 && (
  <div style={{ marginTop: 12 }}>
    {summary.serverPrs.map((p, i) => (
      p.type === 'baseline' ? (
        <p key={i} style={{ color: '#9ca3af', fontSize: '0.8rem' }}>
          {prLabel(p)}
        </p>
      ) : (
        <p key={i} style={{ color: '#fbbf24', fontSize: '0.8rem' }}>
          🎉 New PR — {prLabel(p)}
        </p>
      )
    ))}
  </div>
)}
```

- [ ] **Step 3: Verify in the browser (this is the surface — no unit test)**

Start backend (temp DB) + Vite dev server. In Chrome at ~430px width: Start a workout, log a set for a brand-new exercise, Finish. Confirm the summary shows a muted grey "<Exercise> — baseline set" line with **no** 🎉 and no gold. Then run a second workout beating it and confirm a gold "🎉 New PR —" line appears. Screenshot both.

- [ ] **Step 4: Run the frontend test suite — verify no regression**

Run: `cd frontend && npm test`
Expected: existing 25 tests pass (this change touches only render branches none of them assert on).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Workout.jsx
git commit -m "feat(frontend): show first-entry baseline as a quiet note, not a PR

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

# PART B — Responsive UI audit

> Part B is exploratory: the fix tasks (B2…) are generated from the catalog produced in B1. B2 below pre-analyses the one near-certain offender (the TimerBar row at 320px); apply the same write-test-by-eye → fix → re-screenshot loop for every other catalogued issue.

### Task B1: Sweep every page at every target width → produce the catalog

**Files:**
- Create: `docs/superpowers/audits/2026-06-30-responsive-catalog.md`

**Procedure:**

- [ ] **Step 1: Bring up the app**

```bash
# backend on :8000 with a throwaway DB
python3 -m venv /tmp/wt-venv && /tmp/wt-venv/bin/pip install -q -r backend/requirements.txt
DATABASE_URL=/tmp/wt-audit.db /tmp/wt-venv/bin/uvicorn main:app --app-dir backend --host 127.0.0.1 --port 8000 &
# frontend dev server (proxies /api → :8000)
cd frontend && npm run dev -- --port 5174 --strictPort &
```

Seed one completed session and one in-progress workout so Progress/History/Workout have real content to render.

- [ ] **Step 2: Screenshot the matrix**

For each width in **320, 360, 375, 390, 430, 768, 1024** (and a short pass at **320×568**), use Claude-in-Chrome `resize_window` then visit and screenshot each page+state:
- Home (next-up card, list, Start button, recent sessions + empty state)
- Workout (TopBar, TimerBar resting **and** not-resting, card collapsed/expanded, logger controls, finish summary, toast)
- Progress (recharts)
- History (list + detail/expanded)
- Exercise detail (form cues + demo)

- [ ] **Step 3: Catalog every defect**

Write `docs/superpowers/audits/2026-06-30-responsive-catalog.md` as a table: `Page · Width · Element · Problem · Proposed fix`. Defect criteria: horizontal overflow / clipped buttons; tap target < ~44px; truncated/unreadable text; content hidden behind TopBar or fixed TimerBar/nav; recharts not shrinking. Mark each row Open.

- [ ] **Step 4: Commit the catalog**

```bash
git add docs/superpowers/audits/2026-06-30-responsive-catalog.md
git commit -m "docs: responsive audit catalog (2026-06-30)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task B2: Fix the TimerBar control row at narrow widths (prime suspect)

**Files:**
- Modify: `frontend/src/index.css` (`.timer-bar`, ~L100-106) and/or `frontend/src/components/TimerBar.jsx`

**Context:** `.timer-bar` is a single `display:flex; justify-content:space-between` row holding the session clock **plus** five controls (`−30`, the REST clock, `+30`, `⏸`, `Skip`) inside a 480px-max bar. At 320px these are very likely to crowd or clip. Confirm against the B1 screenshots before changing anything.

- [ ] **Step 1: Reproduce at 320px**

From the B1 matrix, confirm the specific failure (e.g. `Skip` clipped at the right edge, or controls touching the session clock). Note the exact width(s) where it breaks.

- [ ] **Step 2: Apply the smallest fix that holds the layout**

Pick based on what the screenshot shows (do not over-build):
- If only spacing: reduce `.timer-bar` `gap`/`padding` and the control buttons' horizontal padding at `@media (max-width: 360px)`.
- If genuinely too many elements for the width: drop the session-clock-left / controls-right `space-between` and let the control cluster keep its size while the session clock shrinks (it already has `min-width` on the REST clock — keep tap targets ≥44px).

Keep all five controls reachable and ≥44px tall; do not remove controls.

- [ ] **Step 3: Re-screenshot 320 / 360 / 390 / 430**

Confirm no clipping at narrow widths and no regression at wider ones. Update the catalog row(s) to Fixed with a before/after note.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/index.css frontend/src/components/TimerBar.jsx
git commit -m "fix(frontend): keep TimerBar controls un-clipped on narrow phones

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task B3…Bn: Fix remaining catalogued issues

For each remaining Open row in the catalog, run the same loop as B2: reproduce at the failing width → smallest targeted fix (prefer a scoped `@media` rule or a flex/`min-width` tweak over restructuring) → re-screenshot the affected widths to confirm fix + no regression → mark the row Fixed → commit per logical group (one commit per page or per related cluster, not one giant commit).

- [ ] **Final step for Part B: full re-sweep + test suite**

Re-screenshot the whole matrix once more to confirm every catalogued issue is Fixed and nothing regressed. Run `cd frontend && npm test` — expect 25 green. Commit any catalog status updates.

---

# Finalize

### Task F1: Record the pending deploy (do NOT deploy)

**Files:**
- Modify: `AGENTS.md` — Status section, *Pending deploy → Pi* list

- [ ] **Step 1: Append the new commits to the pending-deploy list**

Add the Part A and Part B commits under *Pending deploy → Pi* in `AGENTS.md` (alongside the existing `8405eb1` entry), with a one-line description each. Leave the deploy itself unchecked — it is gated on SSH reachability to the Pi (off-LAN, SSH not exposed over Tailscale). When on the home LAN, deploy is the existing `docker build` (arm64) → `docker save | ssh kapekost@192.168.1.170 'docker load'` → restart sequence already documented in AGENTS.md, run by hand, then verify (`HTTP 200`, serving `Gym Tracker`; visual check: baseline note, TimerBar un-clipped).

- [ ] **Step 2: Commit**

```bash
git add AGENTS.md
git commit -m "docs: status — baseline fix + responsive audit pending Pi deploy

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 3: Push**

```bash
git push origin main
```
