"""POST /api/plan/update: validated, previewable, all-or-nothing plan edits.

See docs/superpowers/specs/2026-09-27-ai-plan-updates-design.md section 5.
"""
import copy

import pytest

SCHEMA = "workout-tracker/plan-update/v1"


def envelope(*day_updates, summary="Edited in the app"):
    return {"schema": SCHEMA, "summary": summary, "day_updates": list(day_updates)}


def day(day_key, *ops):
    return {"day_key": day_key, "exercise_updates": list(ops)}


def post(client, env, confirm=False):
    return client.post("/api/plan/update", json={"envelope": env, "confirm": confirm})


def plan_rows(mainmod, profile_id):
    with mainmod.db() as conn:
        return [tuple(r) for r in conn.execute(
            "SELECT d.day_key, e.exercise_id, e.name, e.alt, e.sets, e.reps_low, e.reps_high, "
            "e.bodyweight, e.muscles_json, e.yt_url, e.cues_json, e.sort_order "
            "FROM plan_exercises e JOIN plan_days d ON d.id = e.plan_day_id "
            "WHERE d.profile_id = ? ORDER BY d.sort_order, e.sort_order", (profile_id,))]


NEW_EX = {"op": "add", "exercise_id": "goblet_squat", "name": "Goblet Squat",
          "sets": 3, "reps_low": 10, "reps_high": 15}


def second_profile_client(mainmod, anon_client, name="other"):
    with mainmod.db() as conn:
        pid = conn.execute(
            "INSERT INTO profiles (username, role) VALUES (?, 'member')", (name,)).lastrowid
        mainmod._seed_plan_for_profile(conn, pid)
        anon_client.cookies.set("wt_session", mainmod.issue_session(conn, pid))
        conn.commit()
    return anon_client, pid


# --- validation: each malformed case is a 400 naming the field ---

@pytest.mark.parametrize("field,value", [
    ("sets", 0), ("sets", 11), ("sets", 400),
    ("reps_low", 0), ("reps_high", 51), ("reps_high", 5000),
])
def test_out_of_range_numbers_400_naming_the_field(client, field, value):
    op = {"op": "modify", "exercise_id": "bench_press", field: value}
    r = post(client, envelope(day("upper_a", op)))
    assert r.status_code == 400, r.text
    assert field in r.json()["detail"]
    assert "modify" in r.json()["detail"]


def test_reps_high_below_reps_low_400(client):
    op = {"op": "modify", "exercise_id": "bench_press", "reps_low": 12, "reps_high": 8}
    r = post(client, envelope(day("upper_a", op)))
    assert r.status_code == 400
    assert "reps_high" in r.json()["detail"]


def test_modify_that_leaves_reps_high_below_the_stored_reps_low_400(client):
    op = {"op": "modify", "exercise_id": "bench_press", "reps_high": 1}
    with_low = post(client, envelope(day("upper_a", {**op, "reps_low": 6, "reps_high": 6})))
    assert with_low.status_code == 200
    r = post(client, envelope(day("upper_a", op)))
    assert r.status_code == 400
    assert "reps_high" in r.json()["detail"]


def test_unknown_day_key_400(client):
    r = post(client, envelope(day("no_such_day", {"op": "remove", "exercise_id": "bench_press"})))
    assert r.status_code == 400
    assert "day_key" in r.json()["detail"] and "no_such_day" in r.json()["detail"]


def test_malformed_day_key_400(client):
    r = post(client, envelope(day("Upper A!", {"op": "remove", "exercise_id": "bench_press"})))
    assert r.status_code == 400
    assert "day_key" in r.json()["detail"]


@pytest.mark.parametrize("op", ["modify", "remove"])
def test_modify_or_remove_of_a_missing_id_400(client, op):
    r = post(client, envelope(day("upper_a", {"op": op, "exercise_id": "nope"} | (
        {"sets": 3} if op == "modify" else {}))))
    assert r.status_code == 400
    assert "exercise_id" in r.json()["detail"] and "nope" in r.json()["detail"]
    assert op in r.json()["detail"]


def test_modify_of_an_id_that_lives_in_another_day_400(client):
    r = post(client, envelope(day("lower_a", {"op": "modify", "exercise_id": "bench_press", "sets": 3})))
    assert r.status_code == 400
    assert "bench_press" in r.json()["detail"]


def test_add_of_an_existing_id_400_suggests_modify(client):
    r = post(client, envelope(day("lower_a", {**NEW_EX, "exercise_id": "bench_press"})))
    assert r.status_code == 400
    assert "exercise_id" in r.json()["detail"] and "modify" in r.json()["detail"]


@pytest.mark.parametrize("missing", ["name", "sets", "reps_low", "reps_high"])
def test_add_requires_name_sets_and_reps(client, missing):
    op = {k: v for k, v in NEW_EX.items() if k != missing}
    r = post(client, envelope(day("upper_a", op)))
    assert r.status_code == 400
    assert missing in r.json()["detail"]


def test_bad_exercise_id_slug_400(client):
    r = post(client, envelope(day("upper_a", {**NEW_EX, "exercise_id": "Goblet Squat"})))
    assert r.status_code == 400
    assert "exercise_id" in r.json()["detail"]


def test_overlong_name_and_cue_400(client):
    r = post(client, envelope(day("upper_a", {**NEW_EX, "name": "x" * 129})))
    assert r.status_code == 400 and "name" in r.json()["detail"]
    r = post(client, envelope(day("upper_a", {**NEW_EX, "cues": ["x" * 161]})))
    assert r.status_code == 400 and "cues" in r.json()["detail"]


def test_unknown_field_and_unknown_op_and_wrong_schema_400(client):
    r = post(client, envelope(day("upper_a", {"op": "modify", "exercise_id": "bench_press", "weight": 100})))
    assert r.status_code == 400 and "weight" in r.json()["detail"]
    r = post(client, envelope(day("upper_a", {"op": "swap", "exercise_id": "bench_press"})))
    assert r.status_code == 400 and "op" in r.json()["detail"]
    r = post(client, {**envelope(), "schema": "something/else"})
    assert r.status_code == 400 and "schema" in r.json()["detail"]


def test_payload_caps_400(client):
    many_days = [day("upper_a", {"op": "modify", "exercise_id": "bench_press", "sets": 3})] * 11
    r = post(client, envelope(*many_days))
    assert r.status_code == 400 and "day_updates" in r.json()["detail"]
    many_ops = [{"op": "modify", "exercise_id": "bench_press", "sets": 3}] * 21
    r = post(client, envelope(day("upper_a", *many_ops)))
    assert r.status_code == 400 and "exercise_updates" in r.json()["detail"]


def test_modify_that_changes_nothing_400(client):
    r = post(client, envelope(day("upper_a", {"op": "modify", "exercise_id": "bench_press"})))
    assert r.status_code == 400


# --- preview vs confirm ---

def mixed_envelope():
    return envelope(
        day("upper_a",
            {"op": "modify", "exercise_id": "bench_press", "sets": 5},
            {"op": "remove", "exercise_id": "ohp"}),
        day("lower_b", NEW_EX),
        summary="Coach suggestion",
    )


def test_preview_writes_nothing_and_counts_are_right(mainmod, client, seed_profile_id):
    before = plan_rows(mainmod, seed_profile_id)
    r = post(client, mixed_envelope(), confirm=False)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["days_affected"] == 2
    assert body["exercises_added"] == 1
    assert body["exercises_modified"] == 1
    assert body["exercises_removed"] == 1
    assert body["ai_summary"] == "Coach suggestion"
    assert any("Goblet Squat" in d for d in body["details"])
    assert len(body["details"]) == 3
    assert plan_rows(mainmod, seed_profile_id) == before


def test_confirm_writes_what_the_preview_said(mainmod, client, seed_profile_id):
    env = mixed_envelope()
    preview = post(client, env, confirm=False).json()
    r = post(client, env, confirm=True)
    assert r.status_code == 200, r.text
    assert r.json() == preview

    plan = client.get("/api/plan").json()["plan"]
    upper_a = {e["id"]: e for e in plan["upper_a"]["exercises"]}
    assert upper_a["bench_press"]["sets"] == 5
    assert "ohp" not in upper_a
    added = plan["lower_b"]["exercises"][-1]
    assert (added["id"], added["name"], added["sets"], added["repsLow"], added["repsHigh"]) == \
        ("goblet_squat", "Goblet Squat", 3, 10, 15)
    assert added["bodyweight"] is False and added["muscles"] == [] and added["cues"] == []


def test_modify_changes_only_the_fields_sent(mainmod, client, seed_profile_id):
    before = {r[1]: r for r in plan_rows(mainmod, seed_profile_id)}["bench_press"]
    post(client, envelope(day("upper_a", {"op": "modify", "exercise_id": "bench_press", "sets": 7})),
         confirm=True)
    after = {r[1]: r for r in plan_rows(mainmod, seed_profile_id)}["bench_press"]
    assert after[4] == 7
    assert after[:4] + after[5:] == before[:4] + before[5:]


def test_confirm_is_all_or_nothing_across_day_updates(mainmod, client, seed_profile_id):
    before = plan_rows(mainmod, seed_profile_id)
    env = envelope(
        day("upper_a", {"op": "modify", "exercise_id": "bench_press", "sets": 9}),
        day("lower_a", {"op": "remove", "exercise_id": "does_not_exist"}),
    )
    r = post(client, env, confirm=True)
    assert r.status_code == 400
    assert plan_rows(mainmod, seed_profile_id) == before


def test_confirm_revalidates_against_the_current_plan(mainmod, client, seed_profile_id):
    env = envelope(day("upper_a", {"op": "remove", "exercise_id": "bench_press"}))
    assert post(client, env, confirm=False).status_code == 200
    assert post(client, env, confirm=True).status_code == 200
    assert post(client, env, confirm=True).status_code == 400


# --- history is never touched ---

def test_remove_leaves_sets_personal_bests_and_notes_untouched(mainmod, client, seed_profile_id):
    with mainmod.db() as conn:
        sid = conn.execute("INSERT INTO sessions (date, workout_day, profile_id, completed) "
                           "VALUES ('2026-01-01', 'upper_a', ?, 1)", (seed_profile_id,)).lastrowid
        conn.execute("INSERT INTO sets (session_id, exercise_id, exercise_name, set_number, weight_kg, reps, profile_id) "
                     "VALUES (?, 'bench_press', 'Bench', 1, 80, 5, ?)", (sid, seed_profile_id))
        conn.execute("INSERT INTO personal_bests (exercise_id, exercise_name, weight_kg, reps, "
                     "achieved_year, profile_id) VALUES ('bench_press', 'Bench', 100, 3, 2025, ?)",
                     (seed_profile_id,))
        conn.execute("INSERT INTO exercise_notes (exercise_id, note, profile_id) "
                     "VALUES ('bench_press', 'elbows in', ?)", (seed_profile_id,))
        conn.commit()

    def history():
        with mainmod.db() as conn:
            return [[tuple(r) for r in conn.execute(f"SELECT * FROM {t} ORDER BY 1")]
                    for t in ("sets", "personal_bests", "exercise_notes")]

    before = history()
    r = post(client, envelope(day("upper_a", {"op": "remove", "exercise_id": "bench_press"})),
             confirm=True)
    assert r.status_code == 200, r.text
    assert history() == before
    assert all(row[1] != "bench_press" for row in plan_rows(mainmod, seed_profile_id))


# --- scope and gates ---

def test_one_profiles_update_never_changes_anothers_plan(mainmod, client, anon_client, seed_profile_id):
    other_client, other_id = second_profile_client(mainmod, anon_client)
    other_before = plan_rows(mainmod, other_id)
    r = post(client, mixed_envelope(), confirm=True)
    assert r.status_code == 200
    assert plan_rows(mainmod, other_id) == other_before
    assert plan_rows(mainmod, seed_profile_id) != other_before


def test_update_by_a_member_writes_only_their_plan(mainmod, client, anon_client, seed_profile_id):
    owner_before = plan_rows(mainmod, seed_profile_id)
    other_client, other_id = second_profile_client(mainmod, anon_client)
    r = post(other_client, mixed_envelope(), confirm=True)
    assert r.status_code == 200, r.text
    assert plan_rows(mainmod, seed_profile_id) == owner_before
    assert any(row[1] == "goblet_squat" for row in plan_rows(mainmod, other_id))


@pytest.mark.parametrize("confirm", [False, True])
def test_409_with_an_open_session(mainmod, client, seed_profile_id, confirm):
    assert client.post("/api/sessions", json={"workout_day": "upper_a"}).status_code == 200
    before = plan_rows(mainmod, seed_profile_id)
    r = post(client, mixed_envelope(), confirm=confirm)
    assert r.status_code == 409
    assert r.json()["detail"] == "Finish or discard your current workout first"
    assert plan_rows(mainmod, seed_profile_id) == before


def test_an_open_session_of_another_profile_does_not_block(mainmod, client, anon_client):
    other_client, _ = second_profile_client(mainmod, anon_client)
    assert other_client.post("/api/sessions", json={"workout_day": "upper_a"}).status_code == 200
    assert post(client, mixed_envelope(), confirm=True).status_code == 200


def test_401_without_a_session(anon_client):
    r = post(anon_client, envelope(), confirm=True)
    assert r.status_code == 401


@pytest.mark.parametrize("field", ["name", "sets", "reps_low", "reps_high", "bodyweight", "muscles", "cues"])
@pytest.mark.parametrize("op", ["modify", "add"])
def test_null_on_a_required_field_is_a_400_not_a_500(client, field, op):
    body = dict(NEW_EX) if op == "add" else {"op": "modify", "exercise_id": "ohp"}
    body[field] = None
    r = post(client, envelope(day("upper_a", body)), confirm=True)
    assert r.status_code == 400
    assert field in r.json()["detail"]


def test_yt_url_must_be_https(client):
    r = post(client, envelope(day("upper_a", {"op": "modify", "exercise_id": "ohp",
                                              "yt_url": "javascript:alert(1)"})))
    assert r.status_code == 400
    assert "yt_url" in r.json()["detail"]


def test_a_lone_surrogate_in_a_name_is_a_400(client):
    raw = ('{"envelope":{"schema":"%s","summary":"x","day_updates":[{"day_key":"upper_a",'
           '"exercise_updates":[{"op":"modify","exercise_id":"ohp","name":"\\ud800"}]}]},'
           '"confirm":true}' % SCHEMA)
    r = client.post("/api/plan/update", content=raw, headers={"content-type": "application/json"})
    assert r.status_code == 400


def test_add_duplicate_check_is_per_profile(client, mainmod, anon_client):
    assert post(client, envelope(day("upper_a", NEW_EX)), confirm=True).status_code == 200
    other, _ = second_profile_client(mainmod, anon_client)
    assert post(other, envelope(day("upper_a", NEW_EX)), confirm=True).status_code == 200
