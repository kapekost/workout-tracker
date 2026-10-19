"""GET /api/plan/export (#220)."""
from test_history import _session
from test_personal_bests import _pb
from test_plan_update import second_profile_client


def export(client, **params):
    return client.get("/api/plan/export", params=params)


def test_export_has_the_spec_shape(client):
    body = export(client).json()
    assert body["schema"] == "workout-tracker/plan-context-export/v1"
    assert set(body) == {"schema", "generated_at", "plan", "recent_sessions",
                         "personal_bests", "notes", "constraints", "prompt_template"}
    assert body["constraints"] == {"weight_unit": "kg",
                                   "no_recovery_percentages_or_readiness_scores": True}
    assert body["plan"] == client.get("/api/plan").json()


def test_recent_sessions_are_completed_only_newest_first_and_capped(mainmod, client):
    ids = [_session(client, "upper_a", [("bench_press", 80 + i, 8)]) for i in range(3)]
    # Dates out of id order, so the date sort is tested and not only the id tie-break.
    with mainmod.db() as conn:
        for sid, date in zip(ids, ("2026-10-03", "2026-10-01", "2026-10-02")):
            conn.execute("UPDATE sessions SET date = ? WHERE id = ?", (date, sid))
        conn.commit()
    _session(client, "lower_a", [("squat", 100, 5)], complete=False)
    sessions = export(client).json()["recent_sessions"]
    assert len(sessions) == 3
    assert [s["sets"][0]["weight_kg"] for s in sessions] == [80.0, 82.0, 81.0]
    assert sessions[0].keys() == {"date", "workout_day", "sets"}
    assert sessions[0]["sets"][0].keys() == {"exercise_id", "exercise_name", "set_number",
                                              "reps", "weight_kg"}
    assert len(export(client, sessions=2).json()["recent_sessions"]) == 2


def test_sessions_param_is_bounded(client):
    for i in range(21):
        _session(client, "upper_a", [("bench_press", 80, 8)])
    assert len(export(client).json()["recent_sessions"]) == 20
    assert export(client, sessions=0).status_code == 422
    assert export(client, sessions=101).status_code == 422


def test_personal_bests_and_notes_are_included(client):
    client.post("/api/personal-bests", json=_pb(weight_kg=85.0, reps=5, achieved_year=2024))
    client.put("/api/exercises/bench_press/note", json={"note": "left shoulder twinges"})
    body = export(client).json()
    assert body["personal_bests"] == [{"exercise_id": "bench_press", "weight_kg": 85.0,
                                       "reps": 5, "achieved_year": 2024}]
    assert body["notes"] == {"bench_press": "left shoulder twinges"}


def test_export_is_scoped_to_the_acting_profile(mainmod, client, anon_client):
    _session(client, "upper_a", [("bench_press", 80, 8)])
    client.put("/api/exercises/bench_press/note", json={"note": "mine"})
    client.post("/api/personal-bests", json=_pb())
    other, _ = second_profile_client(mainmod, anon_client)
    body = export(other).json()
    assert body["plan"] == other.get("/api/plan").json()
    assert body["recent_sessions"] == [] and body["notes"] == {} and body["personal_bests"] == []


def test_export_requires_a_session(anon_client):
    assert export(anon_client).status_code == 401


def test_export_serves_the_prompt_template(mainmod, client):
    template = export(client).json()["prompt_template"]
    assert template == mainmod.PLAN_UPDATE_PROMPT
    # The reply schema the ingestion endpoint accepts, named exactly.
    assert mainmod.PLAN_UPDATE_SCHEMA in template
    assert "Output ONLY a single JSON object" in template
    assert "<PASTE THE EXPORTED JSON HERE>" in template


def test_prompt_template_is_the_same_for_every_profile(mainmod, client, anon_client):
    mine = export(client).json()["prompt_template"]
    other, _ = second_profile_client(mainmod, anon_client)
    assert export(other).json()["prompt_template"] == mine
