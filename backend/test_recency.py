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


def test_empty_db_returns_empty_list(client):
    assert client.get("/api/exercises/recency").json() == []


def test_single_session_reports_sets_volume_and_dates(client, mainmod):
    _session(client, mainmod, "upper_a",
             [("bench_press", "Bench Press", 3, 80.0, 7)], on_date="2026-08-12")
    rows = client.get("/api/exercises/recency").json()
    assert len(rows) == 1
    r = rows[0]
    assert r["exercise_id"] == "bench_press"
    assert r["last_date"] == "2026-08-12"
    assert r["sets"] == 3
    assert r["volume_kg"] == 3 * 80.0 * 7
    assert r["prev_date"] is None
    assert r["last_at"] is not None


def test_incomplete_sessions_are_excluded(client, mainmod):
    _session(client, mainmod, "upper_a",
             [("bench_press", "Bench Press", 3, 80.0, 7)], completed=False)
    assert client.get("/api/exercises/recency").json() == []


def test_prev_date_is_the_second_most_recent_session(client, mainmod):
    _session(client, mainmod, "upper_a",
             [("bench_press", "Bench Press", 3, 70.0, 8)], on_date="2026-07-01")
    _session(client, mainmod, "upper_a",
             [("bench_press", "Bench Press", 3, 75.0, 8)], on_date="2026-08-05")
    _session(client, mainmod, "upper_a",
             [("bench_press", "Bench Press", 3, 80.0, 8)], on_date="2026-08-12")
    r = client.get("/api/exercises/recency").json()[0]
    assert r["last_date"] == "2026-08-12"
    assert r["prev_date"] == "2026-08-05"


def test_only_logged_exercises_appear(client, mainmod):
    # Upper A has 6 planned exercises; log only 2 of them.
    _session(client, mainmod, "upper_a", [
        ("bench_press", "Bench Press", 3, 80.0, 7),
        ("db_curl", "Dumbbell Curl", 2, 14.0, 12),
    ], on_date="2026-08-12")
    ids = {r["exercise_id"] for r in client.get("/api/exercises/recency").json()}
    assert ids == {"bench_press", "db_curl"}


def test_last_at_is_the_max_logged_at_within_the_session(client, mainmod):
    sid = _session(client, mainmod, "upper_a",
                   [("bench_press", "Bench Press", 3, 80.0, 7)], on_date="2026-08-12")
    with mainmod.db() as conn:
        rows = conn.execute(
            "SELECT id FROM sets WHERE session_id = ? ORDER BY id", (sid,)).fetchall()
        for i, row in enumerate(rows):
            conn.execute("UPDATE sets SET logged_at = ? WHERE id = ?",
                         (f"2026-08-12 18:0{i}:00", row["id"]))
        conn.commit()
    r = client.get("/api/exercises/recency").json()[0]
    assert r["last_at"] == "2026-08-12 18:02:00"


def test_sets_and_volume_come_from_the_latest_session_only(client, mainmod):
    _session(client, mainmod, "upper_a",
             [("bench_press", "Bench Press", 5, 60.0, 10)], on_date="2026-07-01")
    _session(client, mainmod, "upper_a",
             [("bench_press", "Bench Press", 2, 80.0, 5)], on_date="2026-08-12")
    r = client.get("/api/exercises/recency").json()[0]
    assert r["sets"] == 2
    assert r["volume_kg"] == 2 * 80.0 * 5
