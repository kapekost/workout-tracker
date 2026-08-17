def test_migration_creates_personal_bests_table(mainmod):
    with mainmod.db() as conn:
        assert conn.execute("PRAGMA user_version").fetchone()[0] == 3
        cols = {r[1] for r in conn.execute("PRAGMA table_info(personal_bests)").fetchall()}
        assert cols == {"id", "exercise_id", "exercise_name", "weight_kg", "reps",
                         "achieved_year", "achieved_note", "created_at"}

def test_migration_is_idempotent(mainmod):
    mainmod.init(); mainmod.init()  # second run must not error
    with mainmod.db() as conn:
        assert conn.execute("PRAGMA user_version").fetchone()[0] == 3

def _pb(exercise_id="bench_press", exercise_name="Bench Press", weight_kg=100.0, reps=3, achieved_year=2023, achieved_note=None):
    return {"exercise_id": exercise_id, "exercise_name": exercise_name, "weight_kg": weight_kg,
            "reps": reps, "achieved_year": achieved_year, "achieved_note": achieved_note}

def test_create_personal_best_returns_row_with_id(client):
    r = client.post("/api/personal-bests", json=_pb())
    assert r.status_code == 200
    body = r.json()
    assert body["id"] is not None
    assert body["exercise_id"] == "bench_press" and body["weight_kg"] == 100.0

def test_create_rejects_future_year(client):
    r = client.post("/api/personal-bests", json=_pb(achieved_year=2099))
    assert r.status_code == 422

def test_create_rejects_out_of_range_weight(client):
    assert client.post("/api/personal-bests", json=_pb(weight_kg=-5)).status_code == 422
    assert client.post("/api/personal-bests", json=_pb(weight_kg=5000)).status_code == 422

def test_duplicate_personal_best_is_409(client):
    client.post("/api/personal-bests", json=_pb())
    r = client.post("/api/personal-bests", json=_pb())
    assert r.status_code == 409

def test_list_personal_bests_orders_by_name_then_weight_desc(client):
    client.post("/api/personal-bests", json=_pb(exercise_name="Squat", exercise_id="back_squat", weight_kg=140, achieved_year=2022))
    client.post("/api/personal-bests", json=_pb(exercise_name="Bench Press", weight_kg=100, achieved_year=2023))
    client.post("/api/personal-bests", json=_pb(exercise_name="Bench Press", weight_kg=110, reps=1, achieved_year=2021))
    rows = client.get("/api/personal-bests").json()
    names_weights = [(r["exercise_name"], r["weight_kg"]) for r in rows]
    assert names_weights == [("Bench Press", 110), ("Bench Press", 100), ("Squat", 140)]

def test_delete_personal_best_removes_it(client):
    pb_id = client.post("/api/personal-bests", json=_pb()).json()["id"]
    assert client.delete(f"/api/personal-bests/{pb_id}").json() == {"deleted": True}
    assert client.get("/api/personal-bests").json() == []

def test_delete_nonexistent_personal_best_still_returns_deleted_true(client):
    assert client.delete("/api/personal-bests/999").json() == {"deleted": True}

def _log_session(client, day, sets):
    sid = client.post("/api/sessions", json={"workout_day": day}).json()["id"]
    for i, (eid, ename, reps, w) in enumerate(sets, start=1):
        client.post(f"/api/sessions/{sid}/sets", json={
            "exercise_id": eid, "exercise_name": ename,
            "set_number": i, "reps": reps, "weight_kg": w})
    client.patch(f"/api/sessions/{sid}", json={"completed": True})
    return sid

def test_pb_with_no_session_history_suppresses_baseline(client):
    client.post("/api/personal-bests", json=_pb(weight_kg=100, reps=3, achieved_year=2023))
    sid = _log_session(client, "upper_a", [("bench_press", "Bench Press", 8, 60.0)])
    prs = client.get(f"/api/sessions/{sid}/prs").json()
    types = [p["type"] for p in prs]
    assert "baseline" not in types
    assert "weight" not in types  # 60kg does not beat the 100kg PB

def test_session_beating_pb_gives_weight_pr(client):
    client.post("/api/personal-bests", json=_pb(weight_kg=100, reps=3, achieved_year=2023))
    sid = _log_session(client, "upper_a", [("bench_press", "Bench Press", 5, 105.0)])
    prs = client.get(f"/api/sessions/{sid}/prs").json()
    weight = next(p for p in prs if p["type"] == "weight")
    assert weight["value"] == 105.0

def test_pb_reps_and_1rm_participate_in_comparison(client):
    client.post("/api/personal-bests", json=_pb(weight_kg=100, reps=3, achieved_year=2023))
    # Same top weight as the PB, more reps than the PB's 3 -> reps PR
    sid = _log_session(client, "upper_a", [("bench_press", "Bench Press", 5, 100.0)])
    prs = client.get(f"/api/sessions/{sid}/prs").json()
    types = [p["type"] for p in prs]
    assert "reps" in types and "1rm" in types

def test_pb_does_not_affect_volume_pr(client):
    client.post("/api/personal-bests", json=_pb(weight_kg=100, reps=3, achieved_year=2023))
    sid = _log_session(client, "upper_a", [("bench_press", "Bench Press", 8, 60.0)])
    prs = client.get(f"/api/sessions/{sid}/prs").json()
    assert "volume" not in [p["type"] for p in prs]  # first-ever completed session: no volume PR either way
