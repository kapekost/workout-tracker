"""Phase 1 (data model): per-profile, DB-backed workout plan.

See docs/superpowers/specs/2026-09-27-ai-plan-updates-design.md §1 and
docs/superpowers/plans/2026-09-27-plan-data-model.md (Task 1a).
"""
import plan_seed


# --- v6 -> v7 migration: plan_days / plan_exercises, backfilled from DEFAULT_PLAN ---

def test_migration_seeds_plan_for_a_profile_with_none(mainmod):
    """A fresh DB (init() already ran _migrate through v7) seeds the seeded
    'kapekost' profile's plan from plan_seed.DEFAULT_PLAN — same 4 days in
    CYCLE order, same 22 exercises total, content byte-identical."""
    with mainmod.db() as conn:
        profile_id = conn.execute(
            "SELECT id FROM profiles WHERE username = 'kapekost'").fetchone()[0]
        days = conn.execute(
            "SELECT id, day_key, name, tag, icon FROM plan_days "
            "WHERE profile_id = ? ORDER BY sort_order", (profile_id,)).fetchall()
        assert [d["day_key"] for d in days] == ["upper_a", "lower_a", "upper_b", "lower_b"]

        total_exercises = conn.execute(
            "SELECT COUNT(*) FROM plan_exercises WHERE plan_day_id IN "
            "(SELECT id FROM plan_days WHERE profile_id = ?)", (profile_id,)).fetchone()[0]
        assert total_exercises == 22

        upper_a_id = days[0]["id"]
        bench = conn.execute(
            "SELECT * FROM plan_exercises WHERE plan_day_id = ? AND exercise_id = 'bench_press'",
            (upper_a_id,)).fetchone()
        seed_bench = plan_seed.DEFAULT_PLAN[0]["exercises"][0]
        assert seed_bench["exercise_id"] == "bench_press"
        assert bench["sets"] == seed_bench["sets"]
        assert bench["reps_low"] == seed_bench["reps_low"]
        assert bench["reps_high"] == seed_bench["reps_high"]
        import json
        assert json.loads(bench["cues_json"]) == seed_bench["cues"]
        assert json.loads(bench["muscles_json"]) == seed_bench["muscles"]


def test_migration_is_a_noop_for_a_profile_with_existing_rows(mainmod):
    """Calling _migrate a second time against the same connection must not
    double-insert or touch existing rows — matching every other _migrate
    block's idempotency guard."""
    with mainmod.db() as conn:
        profile_id = conn.execute(
            "SELECT id FROM profiles WHERE username = 'kapekost'").fetchone()[0]
        before_days = conn.execute(
            "SELECT id, updated_at FROM plan_days WHERE profile_id = ? ORDER BY id",
            (profile_id,)).fetchall()
        before_exercises = conn.execute(
            "SELECT id, updated_at FROM plan_exercises WHERE plan_day_id IN "
            "(SELECT id FROM plan_days WHERE profile_id = ?) ORDER BY id",
            (profile_id,)).fetchall()

        mainmod._migrate(conn)
        conn.commit()

        after_days = conn.execute(
            "SELECT id, updated_at FROM plan_days WHERE profile_id = ? ORDER BY id",
            (profile_id,)).fetchall()
        after_exercises = conn.execute(
            "SELECT id, updated_at FROM plan_exercises WHERE plan_day_id IN "
            "(SELECT id FROM plan_days WHERE profile_id = ?) ORDER BY id",
            (profile_id,)).fetchall()

        assert [dict(r) for r in after_days] == [dict(r) for r in before_days]
        assert [dict(r) for r in after_exercises] == [dict(r) for r in before_exercises]


def test_plan_tables_are_not_in_the_export_import_envelope(mainmod):
    """spec §1.1: plan_days/plan_exercises deliberately do NOT join
    TABLES/TABLE_INTRODUCED_AT this phase — deferred to Phase 4's own review."""
    assert "plan_days" not in mainmod.TABLES
    assert "plan_exercises" not in mainmod.TABLES
    assert "plan_days" not in mainmod.TABLE_INTRODUCED_AT
    assert "plan_exercises" not in mainmod.TABLE_INTRODUCED_AT


# --- create_profile seeds a starter plan ---

def _admin_session(mainmod, anon_client):
    with mainmod.db() as conn:
        pid = conn.execute("SELECT id FROM profiles WHERE username = 'kapekost'").fetchone()[0]
        sid = mainmod.issue_session(conn, pid)
        conn.commit()
    anon_client.cookies.set("wt_session", sid)
    return anon_client


def test_create_profile_seeds_a_starter_plan(mainmod, anon_client, monkeypatch):
    monkeypatch.setattr(mainmod, "send_email", lambda to, subject, body: None)
    admin = _admin_session(mainmod, anon_client)
    r = admin.post("/api/profiles", json={"username": "newbie", "email": "n@example.com"})
    assert r.status_code == 201, r.text
    new_id = r.json()["id"]
    with mainmod.db() as conn:
        day_count = conn.execute(
            "SELECT COUNT(*) FROM plan_days WHERE profile_id = ?", (new_id,)).fetchone()[0]
        exercise_count = conn.execute(
            "SELECT COUNT(*) FROM plan_exercises WHERE plan_day_id IN "
            "(SELECT id FROM plan_days WHERE profile_id = ?)", (new_id,)).fetchone()[0]
    assert day_count == 4
    assert exercise_count == 22


# --- GET /api/plan ---

def test_get_plan_matches_workoutplan_js_shape_for_seeded_profile(client):
    r = client.get("/api/plan")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["cycle"] == ["upper_a", "lower_a", "upper_b", "lower_b"]

    upper_a = body["plan"]["upper_a"]
    assert upper_a["id"] == "upper_a"
    assert upper_a["name"] == "Upper A"
    assert upper_a["tag"] == "Chest · Back Horizontal · Arms"
    assert upper_a["icon"] == "upper"

    bench = upper_a["exercises"][0]
    assert set(bench.keys()) == {
        "id", "name", "alt", "sets", "repsLow", "repsHigh",
        "bodyweight", "muscles", "ytUrl", "cues",
    }
    seed_bench = plan_seed.DEFAULT_PLAN[0]["exercises"][0]
    assert bench["id"] == seed_bench["exercise_id"]
    assert bench["name"] == seed_bench["name"]
    assert bench["alt"] == seed_bench["alt"]
    assert bench["sets"] == seed_bench["sets"]
    assert bench["repsLow"] == seed_bench["reps_low"]
    assert bench["repsHigh"] == seed_bench["reps_high"]
    assert bench["bodyweight"] is False
    assert bench["muscles"] == seed_bench["muscles"]
    assert bench["ytUrl"] == seed_bench["yt_url"]
    assert bench["cues"] == seed_bench["cues"]

    # pullup is the one exercise seeded with bodyweight: true
    upper_b = body["plan"]["upper_b"]
    pullup = next(e for e in upper_b["exercises"] if e["id"] == "pullup")
    assert pullup["bodyweight"] is True


def test_get_plan_requires_a_session(anon_client):
    assert anon_client.get("/api/plan").status_code == 401


def test_get_plan_is_scoped_to_the_acting_profile(mainmod, client, anon_client, monkeypatch):
    """A member with no plan rows of their own (created outside create_profile,
    the way test fixtures elsewhere in this suite insert profiles directly)
    gets an empty plan back, not another profile's."""
    with mainmod.db() as conn:
        member_id = conn.execute(
            "INSERT INTO profiles (username, role) VALUES ('plain', 'member')").lastrowid
        anon_client.cookies.set("wt_session", mainmod.issue_session(conn, member_id))
        conn.commit()
    r = anon_client.get("/api/plan")
    assert r.status_code == 200, r.text
    assert r.json() == {"plan": {}, "cycle": []}


# --- SessionIn.workout_day validated against the profile's own plan_days ---

def test_create_session_accepts_any_day_in_the_profiles_plan(client):
    for day in ("upper_a", "lower_a", "upper_b", "lower_b"):
        r = client.post("/api/sessions", json={"workout_day": day})
        assert r.status_code == 200, r.text
        assert r.json()["workout_day"] == day
        client.patch(f"/api/sessions/{r.json()['id']}", json={"completed": True})


def test_create_session_conflicts_while_a_workout_is_open(client):
    first = client.post("/api/sessions", json={"workout_day": "upper_a"})
    assert first.status_code == 200
    second = client.post("/api/sessions", json={"workout_day": "lower_a"})
    assert second.status_code == 409
    assert len(client.get("/api/sessions").json()) == 1

    client.patch(f"/api/sessions/{first.json()['id']}", json={"completed": True})
    assert client.post("/api/sessions", json={"workout_day": "lower_a"}).status_code == 200


def test_create_session_rejects_a_day_key_not_in_the_profiles_plan(client):
    r = client.post("/api/sessions", json={"workout_day": "bogus_day"})
    assert r.status_code == 400
    assert "bogus_day" in r.json()["detail"]
