from test_profiles import _member_client


def _set(client, sid, **over):
    body = {"exercise_id": "bench_press", "exercise_name": "Bench Press",
            "set_number": 1, "reps": 5, "weight_kg": 60, "client_id": "tap-1"} | over
    return client.post(f"/api/sessions/{sid}/sets", json=body)


def _session(client):
    return client.post("/api/sessions", json={"workout_day": "upper_a"}).json()["id"]


def _sets(client):
    return client.get("/api/export").json()["tables"]["sets"]


def test_a_repeated_client_id_writes_one_row_and_returns_the_original(client):
    sid = _session(client)
    first = _set(client, sid)
    again = _set(client, sid, reps=9)
    assert first.status_code == again.status_code == 200
    assert again.json() == first.json()
    assert len(_sets(client)) == 1


def test_sets_without_a_client_id_still_each_write_a_row(client):
    sid = _session(client)
    _set(client, sid, client_id=None)
    _set(client, sid, client_id=None)
    assert len(_sets(client)) == 2


def test_the_same_client_id_from_another_profile_writes_its_own_row(client, mainmod):
    member, _ = _member_client(mainmod)
    _set(client, _session(client))
    assert _set(member, _session(member)).status_code == 200
    assert len(_sets(client)) == 2


def test_a_client_id_reused_on_another_session_is_409(client):
    sid = _session(client)
    _set(client, sid)
    client.patch(f"/api/sessions/{sid}", json={"completed": True})
    assert _set(client, _session(client)).status_code == 409
    assert len(_sets(client)) == 1


def test_an_empty_or_oversized_client_id_is_422(client):
    sid = _session(client)
    assert _set(client, sid, client_id="").status_code == 422
    assert _set(client, sid, client_id="x" * 65).status_code == 422


def test_a_v8_database_gains_the_column_and_index_and_keeps_its_rows(client, mainmod):
    sid = _session(client)
    _set(client, sid, client_id=None)
    with mainmod.db() as conn:
        conn.execute("DROP INDEX idx_sets_client_id")
        conn.execute("ALTER TABLE sets DROP COLUMN client_id")
        conn.execute("PRAGMA user_version = 8")
        conn.commit()
    mainmod.init()
    mainmod.init()
    with mainmod.db() as conn:
        assert conn.execute("PRAGMA user_version").fetchone()[0] == 9
        assert "client_id" in {r[1] for r in conn.execute("PRAGMA table_info(sets)")}
        assert conn.execute("SELECT COUNT(*) FROM sets").fetchone()[0] == 1
    assert _set(client, sid).status_code == 200


def test_a_v8_envelope_without_client_id_restores(client, reauthenticate):
    sid = _session(client)
    _set(client, sid)
    env = client.get("/api/export").json()
    env["schema_version"] = 8
    for row in env["tables"]["sets"]:
        del row["client_id"]
    r = client.post("/api/import", json={"mode": "replace", "confirm": True, "envelope": env})
    assert r.status_code == 200
    reauthenticate(client)
    assert [s["client_id"] for s in _sets(client)] == [None]


def test_client_id_round_trips_through_a_restore(client, reauthenticate):
    sid = _session(client)
    _set(client, sid)
    env = client.get("/api/export").json()
    r = client.post("/api/import", json={"mode": "replace", "confirm": True, "envelope": env})
    assert r.status_code == 200
    reauthenticate(client)
    assert [s["client_id"] for s in _sets(client)] == ["tap-1"]
    assert _set(client, sid).json()["id"] == _sets(client)[0]["id"]


def test_merging_an_export_back_into_its_own_profile_still_succeeds(mainmod):
    member, _ = _member_client(mainmod)
    _set(member, _session(member))
    env = member.get("/api/export").json()
    r = member.post("/api/import", json={"mode": "merge", "confirm": True, "envelope": env})
    assert r.status_code == 200
    assert r.json()["merged"]["sets"] == 1
    assert len(_sets(member)) == 2
