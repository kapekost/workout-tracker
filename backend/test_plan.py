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


def test_plan_tables_are_in_the_export_import_envelope(mainmod):
    """A plan is user data: leaving these two tables out of the envelope makes a
    whole-database restore delete every plan while user_version stays pinned
    forward, so the v7 backfill can never re-seed it and the app can no longer
    start a workout. v7 is the version that created them, which is what keeps a
    pre-v7 envelope importable."""
    assert "plan_days" in mainmod.TABLES
    assert "plan_exercises" in mainmod.TABLES
    assert mainmod.TABLE_INTRODUCED_AT["plan_days"] == 7
    assert mainmod.TABLE_INTRODUCED_AT["plan_exercises"] == 7


def _replace(client, envelope):
    return client.post("/api/import", json={"envelope": envelope,
                                            "mode": "replace", "confirm": True})


def test_admin_export_carries_the_plan(client):
    env = client.get("/api/export").json()
    assert [d["day_key"] for d in env["tables"]["plan_days"]] == [
        "upper_a", "lower_a", "upper_b", "lower_b"]
    assert len(env["tables"]["plan_exercises"]) == 22


def test_a_replace_import_restores_the_plan(client, mainmod, reauthenticate):
    """The round trip that matters: export, wipe, restore, and the plan is
    byte-identical — including an edit, which is the part a reseed would lose."""
    with mainmod.db() as conn:
        conn.execute("UPDATE plan_exercises SET sets = 9 WHERE exercise_id = 'bench_press'")
        conn.commit()
    before = client.get("/api/plan").json()

    assert _replace(client, client.get("/api/export").json()).status_code == 200
    reauthenticate(client)

    assert client.get("/api/plan").json() == before
    started = client.post("/api/sessions", json={"workout_day": "upper_a"})
    assert started.status_code == 200


def test_a_replace_import_reseeds_a_plan_an_older_envelope_never_had(client, mainmod,
                                                                     reauthenticate):
    """A pre-v7 envelope has no plan tables at all. Restoring one must still
    leave every profile able to start a workout: the plan falls back to
    DEFAULT_PLAN, the same thing the v6->v7 migration gave everyone, rather
    than leaving POST /api/sessions 400ing on an unknown day_key."""
    env = client.get("/api/export").json()
    env["schema_version"] = 6
    env["tables"].pop("plan_days")
    env["tables"].pop("plan_exercises")

    assert _replace(client, env).status_code == 200
    reauthenticate(client)

    assert client.get("/api/plan").json()["cycle"] == ["upper_a", "lower_a",
                                                       "upper_b", "lower_b"]
    assert client.post("/api/sessions", json={"workout_day": "upper_a"}).status_code == 200


def test_a_member_export_carries_only_their_own_plan(client, mainmod, monkeypatch):
    """plan_exercises has no profile_id of its own, so the member scope reaches
    it through plan_days — the same join export already uses for `sets`. Two
    accounts with deliberately different plans must not see each other's."""
    monkeypatch.setattr(mainmod, "send_email", lambda to, subject, body: None)
    r = client.post("/api/profiles", json={"username": "second",
                                           "email": "second@example.com"})
    assert r.status_code == 201
    pid = r.json()["id"]
    with mainmod.db() as conn:
        conn.execute("UPDATE plan_exercises SET sets = 7 WHERE exercise_id = 'bench_press' "
                     "AND plan_day_id IN (SELECT id FROM plan_days WHERE profile_id = ?)",
                     (pid,))
        conn.commit()

    from fastapi.testclient import TestClient
    member = TestClient(mainmod.app)
    with mainmod.db() as conn:
        member.cookies.set("wt_session", mainmod.issue_session(conn, pid))
        conn.commit()

    env = member.get("/api/export").json()
    assert [p["id"] for p in env["tables"]["profiles"]] == [pid]
    assert {d["profile_id"] for d in env["tables"]["plan_days"]} == {pid}
    day_ids = {d["id"] for d in env["tables"]["plan_days"]}
    assert {e["plan_day_id"] for e in env["tables"]["plan_exercises"]} <= day_ids
    bench = [e for e in env["tables"]["plan_exercises"] if e["exercise_id"] == "bench_press"]
    assert [e["sets"] for e in bench] == [7]
    # The admin's own plan still carries the unedited value, so the two plans
    # really are distinguishable rather than one having overwritten both.
    admin_env = client.get("/api/export").json()["tables"]
    admin_days = {d["id"] for d in admin_env["plan_days"]
                  if d["profile_id"] != pid}
    admin_bench = [e["sets"] for e in admin_env["plan_exercises"]
                   if e["exercise_id"] == "bench_press" and e["plan_day_id"] in admin_days]
    assert admin_bench == [plan_seed.DEFAULT_PLAN[0]["exercises"][0]["sets"]]


def test_a_replace_import_reseeds_only_the_plan_the_envelope_lacks(mainmod):
    """The reseed is per-profile and only fills a genuine gap: an account whose
    plan rows are missing from the envelope gets DEFAULT_PLAN back, and one
    whose plan survived the restore keeps it edit-for-edit."""
    with mainmod.db() as conn:
        admin_pid = conn.execute(
            "SELECT id FROM profiles WHERE username = 'kapekost'").fetchone()[0]
    from fastapi.testclient import TestClient
    admin = TestClient(mainmod.app)
    with mainmod.db() as conn:
        admin.cookies.set("wt_session", mainmod.issue_session(conn, admin_pid))
        conn.commit()
        r = admin.post("/api/profiles", json={"username": "second", "email": "s2@example.com"})
        assert r.status_code == 201
        pid = r.json()["id"]
        conn.execute("UPDATE plan_exercises SET sets = 6 WHERE exercise_id = 'bench_press' "
                     "AND plan_day_id IN (SELECT id FROM plan_days WHERE profile_id = ?)",
                     (pid,))
        conn.commit()

    env = admin.get("/api/export").json()
    # Both profiles stay in the envelope, but the second one's plan does not —
    # an envelope taken from a database whose plan had already been lost.
    env["tables"]["plan_days"] = [d for d in env["tables"]["plan_days"]
                                  if d["profile_id"] == admin_pid]
    keep = {d["id"] for d in env["tables"]["plan_days"]}
    env["tables"]["plan_exercises"] = [e for e in env["tables"]["plan_exercises"]
                                       if e["plan_day_id"] in keep]
    assert _replace(admin, env).status_code == 200

    with mainmod.db() as conn:
        # The account that had a plan keeps it, edit intact...
        bench = conn.execute(
            "SELECT sets FROM plan_exercises WHERE exercise_id = 'bench_press' "
            "AND plan_day_id IN (SELECT id FROM plan_days WHERE profile_id = ?)",
            (admin_pid,)).fetchone()
        assert bench["sets"] == plan_seed.DEFAULT_PLAN[0]["exercises"][0]["sets"]
        # ...and the account that had none gets DEFAULT_PLAN rather than an
        # app that 400s on every workout day.
        assert conn.execute("SELECT COUNT(*) FROM plan_days WHERE profile_id = ?",
                            (pid,)).fetchone()[0] == 4
        assert conn.execute("SELECT COUNT(*) FROM plan_exercises WHERE plan_day_id IN "
                            "(SELECT id FROM plan_days WHERE profile_id = ?)",
                            (pid,)).fetchone()[0] == 22


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


def test_reopening_a_session_conflicts_while_another_is_open(client):
    first = client.post("/api/sessions", json={"workout_day": "upper_a"}).json()
    client.patch(f"/api/sessions/{first['id']}", json={"completed": True})
    second = client.post("/api/sessions", json={"workout_day": "lower_a"}).json()

    r = client.patch(f"/api/sessions/{first['id']}", json={"completed": False})
    assert r.status_code == 409
    assert client.patch(f"/api/sessions/{second['id']}", json={"completed": False}).status_code == 200

    client.patch(f"/api/sessions/{second['id']}", json={"completed": True})
    assert client.patch(f"/api/sessions/{first['id']}", json={"completed": False}).status_code == 200


def test_an_open_session_does_not_block_another_profile(client, anon_client, mainmod):
    assert client.post("/api/sessions", json={"workout_day": "upper_a"}).status_code == 200
    with mainmod.db() as conn:
        other = conn.execute("INSERT INTO profiles (username, role) VALUES ('other', 'member')").lastrowid
        conn.execute("INSERT INTO plan_days (profile_id, day_key, name, sort_order) "
                     "SELECT ?, day_key, name, sort_order FROM plan_days WHERE day_key = 'upper_a' LIMIT 1",
                     (other,))
        anon_client.cookies.set("wt_session", mainmod.issue_session(conn, other))
        conn.commit()
    assert anon_client.post("/api/sessions", json={"workout_day": "upper_a"}).status_code == 200


def test_create_session_rejects_a_day_key_not_in_the_profiles_plan(client):
    r = client.post("/api/sessions", json={"workout_day": "bogus_day"})
    assert r.status_code == 400
    assert "bogus_day" in r.json()["detail"]
