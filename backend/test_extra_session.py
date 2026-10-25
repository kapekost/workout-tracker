"""A session with workout_day "extra" is logged outside the plan (#552)."""
from test_history import _session
from test_plan_update import second_profile_client


def start(client, day):
    return client.post("/api/sessions", json={"workout_day": day})


def test_extra_session_allowed_without_plan_day(client):
    assert "extra" not in client.get("/api/plan").json()["plan"]
    r = start(client, "extra")
    assert r.status_code == 200
    assert r.json()["workout_day"] == "extra"


def test_extra_session_coexists_with_open_planned_session(client):
    assert start(client, "upper_a").status_code == 200
    assert start(client, "extra").status_code == 200


def test_extra_first_then_planned(client):
    assert start(client, "extra").status_code == 200
    assert start(client, "upper_a").status_code == 200


def test_second_open_extra_session_is_409(client):
    assert start(client, "extra").status_code == 200
    assert start(client, "extra").status_code == 409


def test_reopen_extra_does_not_collide_with_planned(client):
    extra = _session(client, "extra", [("bench_press", 40, 10)])
    assert start(client, "upper_a").status_code == 200
    r = client.patch(f"/api/sessions/{extra}", json={"completed": False})
    assert r.status_code == 200 and r.json()["completed"] == 0


def test_reopen_extra_collides_with_open_extra(client):
    first = _session(client, "extra", [("bench_press", 40, 10)])
    assert start(client, "extra").status_code == 200
    assert client.patch(f"/api/sessions/{first}", json={"completed": False}).status_code == 409


def test_reopen_planned_ignores_open_extra(client):
    planned = _session(client, "upper_a", [("bench_press", 80, 8)])
    assert start(client, "extra").status_code == 200
    assert client.patch(f"/api/sessions/{planned}", json={"completed": False}).status_code == 200


def test_planned_start_still_409_when_planned_open(client):
    assert start(client, "upper_a").status_code == 200
    assert start(client, "lower_a").status_code == 409
    assert start(client, "upper_a").status_code == 409


def test_new_plan_day_never_takes_the_extra_key(client):
    key = client.post("/api/plan/days", json={"name": "Extra"}).json()["id"]
    assert key != "extra"


def test_extra_sets_appear_in_export_and_prs(client):
    sid = _session(client, "extra", [("bench_press", 90, 5)])
    assert client.get(f"/api/sessions/{sid}/prs").status_code == 200
    export = client.get("/api/export").json()
    assert [s["workout_day"] for s in export["tables"]["sessions"]] == ["extra"]
    assert len(export["tables"]["sets"]) == 1
    recent = client.get("/api/plan/export").json()["recent_sessions"]
    assert recent[0]["workout_day"] == "extra" and len(recent[0]["sets"]) == 1
    progress = client.get("/api/progress/bench_press").json()
    assert progress and progress[0]["max_weight"] == 90
    assert client.get("/api/sessions").json()[0]["workout_day"] == "extra"


def test_merge_import_accepts_an_extra_session(mainmod, anon_client):
    member, _ = second_profile_client(mainmod, anon_client)
    _session(member, "extra", [("bench_press", 90, 5)])
    env = member.get("/api/export").json()
    r = member.post("/api/import", json={"envelope": env, "mode": "merge", "confirm": True})
    assert r.status_code == 200, r.text
    assert [s["workout_day"] for s in member.get("/api/sessions").json()] == ["extra", "extra"]
