"""Pure-function tests for suggest_progression() and round_to_step()
(spec: docs/superpowers/specs/2026-09-27-dynamic-progression-design.md §2.1-2.4;
plan: docs/superpowers/plans/2026-09-27-dynamic-progression.md, Task 1).

No DB needed for any of these — they exercise plain function calls on `main`.
The `mainmod` fixture (from conftest.py) is used only because importing `main`
directly runs `init()` against DB_PATH at module load time; it gives every
test its own throwaway temp database so that import is safe.

Task 2 adds endpoint-level tests below for GET /api/exercises/{id}/last, which
do need the DB/TestClient — they reuse the `_session` helper from
test_recency.py, copied here rather than imported (this suite's own documented
precedent for small per-file test helpers; see plan Task 2).
"""

from datetime import date, timedelta


def _session(client, mainmod, day, exercises, completed=True, on_date=None):
    """exercises: list of (exercise_id, exercise_name, n_sets, weight, reps)"""
    sid = client.post("/api/sessions", json={"workout_day": day}).json()["id"]
    for ex_id, ex_name, n, w, reps in exercises:
        for i in range(n):
            client.post(f"/api/sessions/{sid}/sets", json={
                "exercise_id": ex_id, "exercise_name": ex_name,
                "set_number": i + 1, "reps": reps, "weight_kg": w})
    if completed:
        client.patch(f"/api/sessions/{sid}", json={"completed": True})
    if on_date:
        with mainmod.db() as conn:
            conn.execute("UPDATE sessions SET date = ? WHERE id = ?", (on_date, sid))
            conn.commit()
    return sid


def _sets(weight, reps_list):
    return [{"set_number": i + 1, "weight_kg": weight, "reps": r}
            for i, r in enumerate(reps_list)]


def test_round_to_step_exact_half_rounds_up(mainmod):
    assert mainmod.round_to_step(41.25) == 42.5


def test_round_to_step_floors_at_zero(mainmod):
    assert mainmod.round_to_step(-5) == 0


def test_no_history_returns_static_default(mainmod):
    result = mainmod.suggest_progression([], reps_low=6, reps_high=10, days_since=None)
    assert result == {
        "weight_kg": 20,
        "reps": 6,
        "warmup": None,
        "hit_status": None,
        "layoff_band": "none",
    }

    result_bw = mainmod.suggest_progression(
        [], reps_low=6, reps_high=10, days_since=None, bodyweight=True)
    assert result_bw["weight_kg"] == 0


def test_recent_clean_hit_progresses(mainmod):
    last_sets = _sets(80.0, [8, 8, 8])
    result = mainmod.suggest_progression(
        last_sets, reps_low=6, reps_high=8, days_since=3)
    assert result["weight_kg"] == 82.5
    assert result["reps"] == 6
    assert result["hit_status"] == "clean"
    assert result["layoff_band"] == "recent"
    assert result["warmup"] == {"weight_kg": 42.5, "reps": 10}


def test_recent_partial_hit_holds_weight_targets_top_of_range(mainmod):
    last_sets = _sets(70.0, [7, 6, 6])
    result = mainmod.suggest_progression(
        last_sets, reps_low=6, reps_high=10, days_since=3)
    assert result["weight_kg"] == 70.0
    assert result["reps"] == 10
    assert result["hit_status"] == "partial"


def test_recent_missed_holds_weight_targets_bottom_of_range(mainmod):
    last_sets = _sets(70.0, [5, 6, 6])
    result = mainmod.suggest_progression(
        last_sets, reps_low=6, reps_high=10, days_since=3)
    assert result["weight_kg"] == 70.0
    assert result["reps"] == 6
    assert result["hit_status"] == "missed"


def test_short_layoff_holds_flat_even_on_clean_hit(mainmod):
    last_sets = _sets(80.0, [8, 8, 8])
    for days_since in (14, 27):
        result = mainmod.suggest_progression(
            last_sets, reps_low=6, reps_high=8, days_since=days_since)
        assert result["weight_kg"] == 80.0
        assert result["reps"] == 8
        assert result["layoff_band"] == "short"


def test_moderate_layoff_reduces_regardless_of_hit_status(mainmod):
    last_sets = _sets(80.0, [8, 8, 8])  # clean hit, but the layoff overrides it
    for days_since in (28, 56):
        result = mainmod.suggest_progression(
            last_sets, reps_low=6, reps_high=8, days_since=days_since)
        assert result["weight_kg"] == mainmod.round_to_step(80.0 * 0.9)
        assert result["reps"] == 6
        assert result["layoff_band"] == "moderate"


def test_long_layoff_reduces_further(mainmod):
    last_sets = _sets(80.0, [8, 8, 8])
    result = mainmod.suggest_progression(
        last_sets, reps_low=6, reps_high=8, days_since=57)
    assert result["weight_kg"] == mainmod.round_to_step(80.0 * 0.8)
    assert result["reps"] == 6
    assert result["layoff_band"] == "long"


def test_warmup_is_null_for_bodyweight_with_zero_working_weight(mainmod):
    result = mainmod.suggest_progression(
        [], reps_low=6, reps_high=10, days_since=None, bodyweight=True)
    assert result["warmup"] is None


def test_warmup_reps_capped_at_fifteen(mainmod):
    last_sets = _sets(20.0, [15, 15, 15])
    result = mainmod.suggest_progression(
        last_sets, reps_low=10, reps_high=15, days_since=3)
    assert result["warmup"]["reps"] == 15


# --- Task 2: GET /api/exercises/{exercise_id}/last enrichment ---
# spec §3.2; plan Task 2 Step 2.

def test_last_endpoint_includes_suggestion_when_reps_params_given(client, mainmod):
    on_date = (date.today() - timedelta(days=3)).isoformat()
    _session(client, mainmod, "upper_a",
             [("bench_press", "Bench Press", 3, 80.0, 8)], on_date=on_date)

    body = client.get("/api/exercises/bench_press/last",
                       params={"reps_low": 6, "reps_high": 8}).json()

    # 80kg x [8,8,8], reps_low=6/reps_high=8, days_since=3 -> clean + recent,
    # same math as test_recent_clean_hit_progresses above.
    assert body["suggestion"] == {
        "weight_kg": 82.5,
        "reps": 6,
        "warmup": {"weight_kg": 42.5, "reps": 10},
        "hit_status": "clean",
        "layoff_band": "recent",
    }


def test_last_endpoint_omits_suggestion_when_reps_params_absent(client, mainmod):
    on_date = (date.today() - timedelta(days=3)).isoformat()
    sid = _session(client, mainmod, "upper_a",
                   [("bench_press", "Bench Press", 3, 80.0, 8)], on_date=on_date)

    body = client.get("/api/exercises/bench_press/last").json()

    # Backward-compat: omitting reps_low/reps_high means no `suggestion` key
    # at all, and the response is byte-for-byte what today's endpoint returns.
    assert set(body.keys()) == {"session_id", "date", "sets"}
    assert body["session_id"] == sid
    assert body["date"] == on_date
    assert body["sets"] == [
        {"set_number": i + 1, "weight_kg": 80.0, "reps": 8} for i in range(3)
    ]


def test_last_endpoint_returns_null_unchanged_with_no_history(client):
    resp = client.get("/api/exercises/bench_press/last",
                       params={"reps_low": 6, "reps_high": 8})
    assert resp.json() is None
