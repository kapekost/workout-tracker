def _share_bests_column(mainmod):
    with mainmod.db() as conn:
        return [r for r in conn.execute("PRAGMA table_info(profiles)") if r[1] == "share_bests"]


def test_migration_adds_share_bests_default_off(mainmod, seed_profile_id):
    col, = _share_bests_column(mainmod)
    assert col[2] == "INTEGER" and col[3] == 1 and col[4] == "0"
    with mainmod.db() as conn:
        assert conn.execute("SELECT share_bests FROM profiles WHERE id = ?", (seed_profile_id,)).fetchone()[0] == 0


def test_a_v9_database_gains_the_column_and_migration_is_idempotent(mainmod, seed_profile_id):
    with mainmod.db() as conn:
        conn.execute("ALTER TABLE profiles DROP COLUMN share_bests")
        conn.execute("PRAGMA user_version = 9")
        conn.commit()
    mainmod.init()
    mainmod.init()
    with mainmod.db() as conn:
        assert conn.execute("PRAGMA user_version").fetchone()[0] == 10
        assert conn.execute("SELECT share_bests FROM profiles WHERE id = ?", (seed_profile_id,)).fetchone()[0] == 0
    assert len(_share_bests_column(mainmod)) == 1


def test_old_v9_envelope_restores_with_sharing_off(client, mainmod, seed_profile_id):
    env = client.get("/api/export").json()
    env["schema_version"] = 9
    for row in env["tables"]["profiles"]:
        del row["share_bests"]
    r = client.post("/api/import", json={"mode": "replace", "confirm": True, "envelope": env})
    assert r.status_code == 200
    with mainmod.db() as conn:
        assert conn.execute("SELECT share_bests FROM profiles WHERE id = ?", (seed_profile_id,)).fetchone()[0] == 0


def test_restore_never_opts_anyone_in(client, mainmod, seed_profile_id):
    with mainmod.db() as conn:
        conn.execute("UPDATE profiles SET share_bests = 1 WHERE id = ?", (seed_profile_id,))
        conn.commit()
    env = client.get("/api/export").json()
    assert env["tables"]["profiles"][0]["share_bests"] == 1
    r = client.post("/api/import", json={"mode": "replace", "confirm": True, "envelope": env})
    assert r.status_code == 200
    with mainmod.db() as conn:
        assert conn.execute("SELECT share_bests FROM profiles WHERE id = ?", (seed_profile_id,)).fetchone()[0] == 0


from fastapi.testclient import TestClient


def _member(mainmod, username, sharing=False):
    """A logged-in member with their own profile and session cookie."""
    with mainmod.db() as conn:
        pid = conn.execute("INSERT INTO profiles (username, role, share_bests) VALUES (?, 'member', ?)",
                           (username, int(sharing))).lastrowid
        cookie = mainmod.issue_session(conn, pid)
        conn.commit()
    c = TestClient(mainmod.app)
    c.cookies.set("wt_session", cookie)
    return c, pid


def _sharing_of(mainmod, pid):
    with mainmod.db() as conn:
        return conn.execute("SELECT share_bests FROM profiles WHERE id = ?", (pid,)).fetchone()[0]


def test_sharing_defaults_off(client):
    assert client.get("/api/personal-bests/top").json()["sharing"] is False
    assert client.put("/api/personal-bests/sharing", json={"sharing": False}).json() == {"sharing": False, "top": {}}


def test_sharing_toggle_persists(client, mainmod, seed_profile_id):
    assert client.put("/api/personal-bests/sharing", json={"sharing": True}).json() == {"sharing": True, "top": {}}
    assert _sharing_of(mainmod, seed_profile_id) == 1
    assert client.put("/api/personal-bests/sharing", json={"sharing": False}).json() == {"sharing": False, "top": {}}
    assert _sharing_of(mainmod, seed_profile_id) == 0


def test_sharing_rejects_non_bool(client):
    for bad in ("yes", 1, None):
        assert client.put("/api/personal-bests/sharing", json={"sharing": bad}).status_code == 422
    assert client.put("/api/personal-bests/sharing", json={}).status_code == 422
    assert client.put("/api/personal-bests/sharing", json={"sharing": True, "profile_id": 1}).status_code == 422


def test_sharing_requires_session(anon_client):
    assert anon_client.put("/api/personal-bests/sharing", json={"sharing": True}).status_code == 401


def _best(mainmod, pid, exercise_id, weight_kg, reps=1):
    with mainmod.db() as conn:
        conn.execute(
            "INSERT INTO personal_bests (profile_id, exercise_id, exercise_name, weight_kg, reps, achieved_year) "
            "VALUES (?, ?, ?, ?, ?, 2024)", (pid, exercise_id, exercise_id, weight_kg, reps))
        conn.commit()


def _logged(mainmod, pid, exercise_id, weight_kg, reps, completed=True):
    with mainmod.db() as conn:
        sid = conn.execute("INSERT INTO sessions (date, workout_day, completed, profile_id) "
                           "VALUES ('2026-10-01', 'upper_a', ?, ?)", (int(completed), pid)).lastrowid
        conn.execute("INSERT INTO sets (session_id, exercise_id, exercise_name, set_number, reps, weight_kg) "
                     "VALUES (?, ?, ?, 1, ?, ?)", (sid, exercise_id, exercise_id, reps, weight_kg))
        conn.commit()


def _sharers(mainmod, weights, exercise_id="bench_press"):
    """One opted-in member per weight, each with a single-rep best."""
    pids = []
    for i, w in enumerate(weights):
        _, pid = _member(mainmod, f"sharer-{exercise_id}-{i}", sharing=True)
        _best(mainmod, pid, exercise_id, w)
        pids.append(pid)
    return pids


def _top(client):
    r = client.get("/api/personal-bests/top")
    assert r.status_code == 200
    return r.json()


def test_top_lists_three_values_descending(client, mainmod, seed_profile_id):
    _best(mainmod, seed_profile_id, "bench_press", 90)
    _sharers(mainmod, [100, 120, 90, 110])
    assert _top(client) == {"sharing": False, "top": {"bench_press": [120, 110, 100]}}


def test_top_excludes_the_caller(client, mainmod, seed_profile_id):
    _best(mainmod, seed_profile_id, "bench_press", 200)
    client.put("/api/personal-bests/sharing", json={"sharing": True})
    _sharers(mainmod, [100, 110, 120])
    assert _top(client)["top"]["bench_press"] == [120, 110, 100]


def test_opted_out_member_never_appears(client, mainmod, seed_profile_id):
    _best(mainmod, seed_profile_id, "bench_press", 90)
    _sharers(mainmod, [100, 110, 120])
    _, hidden = _member(mainmod, "hidden")
    _best(mainmod, hidden, "bench_press", 300)
    assert _top(client)["top"]["bench_press"] == [120, 110, 100]


def test_opting_out_removes_member_at_once(client, mainmod, seed_profile_id):
    _best(mainmod, seed_profile_id, "bench_press", 90)
    c, pid = _member(mainmod, "leaver", sharing=True)
    _best(mainmod, pid, "bench_press", 300)
    _sharers(mainmod, [100, 110])
    assert _top(client)["top"]["bench_press"] == [300, 110, 100]
    assert c.put("/api/personal-bests/sharing", json={"sharing": False}).status_code == 200
    assert "bench_press" not in _top(client)["top"]


def test_fewer_than_three_members_hides_the_exercise(client, mainmod, seed_profile_id):
    _best(mainmod, seed_profile_id, "bench_press", 90)
    _sharers(mainmod, [100, 110])
    assert _top(client) == {"sharing": False, "top": {}}


def test_three_values_from_one_member_do_not_qualify(client, mainmod, seed_profile_id):
    _best(mainmod, seed_profile_id, "bench_press", 90)
    _, pid = _member(mainmod, "lifter", sharing=True)
    for w in (100, 110, 120):
        _best(mainmod, pid, "bench_press", w)
    _logged(mainmod, pid, "bench_press", 130, 1)
    _sharers(mainmod, [95])
    assert _top(client)["top"] == {}


def test_logged_sets_in_completed_sessions_count(client, mainmod, seed_profile_id):
    _best(mainmod, seed_profile_id, "bench_press", 90)
    _sharers(mainmod, [100, 110])
    _, pid = _member(mainmod, "logger", sharing=True)
    _logged(mainmod, pid, "bench_press", 130, 1)
    assert _top(client)["top"]["bench_press"] == [130, 110, 100]


def test_open_session_sets_do_not_count(client, mainmod, seed_profile_id):
    _best(mainmod, seed_profile_id, "bench_press", 90)
    _sharers(mainmod, [100, 110])
    _, pid = _member(mainmod, "logger", sharing=True)
    _logged(mainmod, pid, "bench_press", 130, 1, completed=False)
    assert _top(client)["top"] == {}


def test_best_is_est_1rm_not_raw_weight(client, mainmod, seed_profile_id):
    _best(mainmod, seed_profile_id, "bench_press", 90)
    _, a = _member(mainmod, "a", sharing=True)
    _, b = _member(mainmod, "b", sharing=True)
    _, c = _member(mainmod, "c", sharing=True)
    _best(mainmod, a, "bench_press", 110, 1)
    _best(mainmod, b, "bench_press", 100, 10)   # 133.5 est. 1RM
    _best(mainmod, c, "bench_press", 50, 1)
    assert _top(client)["top"]["bench_press"] == [133.5, 110, 50]


def test_response_has_no_ids_names_or_dates(client, mainmod, seed_profile_id):
    _best(mainmod, seed_profile_id, "bench_press", 90)
    for i, w in enumerate([100, 110, 120]):
        _, pid = _member(mainmod, f"zorgon{i}", sharing=True)
        with mainmod.db() as conn:
            conn.execute(
                "INSERT INTO personal_bests (profile_id, exercise_id, exercise_name, weight_kg, reps, "
                "achieved_year, achieved_note) VALUES (?, 'bench_press', 'Bench Press', ?, 1, 1987, 'quuxnote')",
                (pid, w))
            conn.commit()
        _logged(mainmod, pid, "bench_press", 50, 1)
    r = client.get("/api/personal-bests/top")
    assert set(r.json()) == {"sharing", "top"}
    assert set(r.json()["top"]) == {"bench_press"}
    assert all(type(v) in (int, float) for v in r.json()["top"]["bench_press"])
    for leak in ("zorgon", "quuxnote", "1987", "2026-10-01", "upper_a"):
        assert leak not in r.text


def test_comparison_responses_are_not_cached(client):
    assert client.get("/api/personal-bests/top").headers["cache-control"] == "no-store"
    assert client.put("/api/personal-bests/sharing", json={"sharing": True}).headers["cache-control"] == "no-store"


def test_only_callers_exercises_are_returned(client, mainmod, seed_profile_id):
    _best(mainmod, seed_profile_id, "bench_press", 90)
    _sharers(mainmod, [100, 110, 120])
    _sharers(mainmod, [100, 110, 120], exercise_id="squat")
    assert set(_top(client)["top"]) == {"bench_press"}


def test_unknown_exercise_absent(client, mainmod, seed_profile_id):
    _sharers(mainmod, [100, 110, 120])
    assert _top(client)["top"] == {}


def test_top_reports_the_callers_own_sharing_state(client):
    client.put("/api/personal-bests/sharing", json={"sharing": True})
    assert _top(client)["sharing"] is True


def test_top_requires_session(anon_client):
    assert anon_client.get("/api/personal-bests/top").status_code == 401
