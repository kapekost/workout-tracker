"""POST /api/plan/reset and GET /api/plan/catalog (#177 part B)."""
import re

import pytest

import plan_seed
from main import PlanExerciseOp
from test_plan_update import NEW_EX, day, envelope, plan_rows, post, second_profile_client

SLUG = re.compile(r"^[a-z][a-z0-9_]{0,63}$")
YT = "https://www.youtube.com/results?search_query="
DEFAULT_IDS = {ex["exercise_id"] for d in plan_seed.DEFAULT_PLAN for ex in d["exercises"]}


def edit(client):
    """Remove one exercise, change another, add a new one."""
    env = envelope(
        day("upper_a",
            {"op": "remove", "exercise_id": "bench_press"},
            {"op": "modify", "exercise_id": "ohp", "sets": 5, "name": "Strict Press"},
            NEW_EX),
    )
    assert post(client, env, confirm=True).status_code == 200


# --- reset ---

def test_reset_restores_the_default_plan_after_edits(mainmod, client, anon_client, seed_profile_id):
    # A second profile never edited, so its rows are a fresh DEFAULT_PLAN seed.
    _, fresh_id = second_profile_client(mainmod, anon_client)
    fresh = plan_rows(mainmod, fresh_id)
    edit(client)
    assert plan_rows(mainmod, seed_profile_id) != fresh
    r = client.post("/api/plan/reset")
    assert r.status_code == 200, r.text
    assert r.json() == {"reset": True}
    assert plan_rows(mainmod, seed_profile_id) == fresh


def test_reset_of_an_unedited_plan_leaves_it_identical(mainmod, client, seed_profile_id):
    before = plan_rows(mainmod, seed_profile_id)
    assert client.post("/api/plan/reset").status_code == 200
    assert plan_rows(mainmod, seed_profile_id) == before
    assert client.get("/api/plan").json()["cycle"] == [d["day_key"] for d in plan_seed.DEFAULT_PLAN]


def test_reset_leaves_sets_personal_bests_and_notes_untouched(mainmod, client, seed_profile_id):
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
                    for t in ("sessions", "sets", "personal_bests", "exercise_notes")]

    edit(client)
    before = history()
    assert client.post("/api/plan/reset").status_code == 200
    assert history() == before


def test_reset_does_not_touch_another_profiles_plan(mainmod, client, anon_client, seed_profile_id):
    other_client, other_id = second_profile_client(mainmod, anon_client)
    edit(other_client)
    other_before = plan_rows(mainmod, other_id)
    edit(client)
    assert client.post("/api/plan/reset").status_code == 200
    assert plan_rows(mainmod, other_id) == other_before


def test_reset_409_with_an_open_session_and_changes_nothing(mainmod, client, seed_profile_id):
    edit(client)
    before = plan_rows(mainmod, seed_profile_id)
    assert client.post("/api/sessions", json={"workout_day": "upper_a"}).status_code == 200
    r = client.post("/api/plan/reset")
    assert r.status_code == 409
    assert r.json()["detail"] == "Finish or discard your current workout first"
    assert plan_rows(mainmod, seed_profile_id) == before


def test_an_open_session_of_another_profile_does_not_block_reset(mainmod, client, anon_client):
    other_client, _ = second_profile_client(mainmod, anon_client)
    assert other_client.post("/api/sessions", json={"workout_day": "upper_a"}).status_code == 200
    assert client.post("/api/plan/reset").status_code == 200


@pytest.mark.parametrize("method,path", [("POST", "/api/plan/reset"), ("GET", "/api/plan/catalog")])
def test_401_without_a_session(anon_client, method, path):
    assert anon_client.request(method, path).status_code == 401


# --- catalog ---

def test_catalog_endpoint_returns_the_constant(client):
    r = client.get("/api/plan/catalog")
    assert r.status_code == 200
    assert r.json() == plan_seed.EXERCISE_CATALOG


def test_catalog_ids_are_unique_valid_slugs():
    ids = [e["exercise_id"] for e in plan_seed.EXERCISE_CATALOG]
    assert len(ids) == len(set(ids))
    assert all(SLUG.match(i) for i in ids)


def test_catalog_holds_every_default_exercise_unchanged():
    by_id = {e["exercise_id"]: e for e in plan_seed.EXERCISE_CATALOG}
    for d in plan_seed.DEFAULT_PLAN:
        for ex in d["exercises"]:
            assert by_id[ex["exercise_id"]] == ex


def test_no_alternative_collides_with_a_default_id():
    alternatives = [e for e in plan_seed.EXERCISE_CATALOG if e["exercise_id"] not in DEFAULT_IDS]
    assert len(plan_seed.EXERCISE_CATALOG) - len(alternatives) == len(DEFAULT_IDS)
    assert 0 < len(alternatives) <= 20


def test_catalog_links_and_cues_are_within_the_caps():
    for e in plan_seed.EXERCISE_CATALOG:
        assert e["yt_url"].startswith(YT), e["exercise_id"]
        assert 1 <= len(e["cues"]) <= 8, e["exercise_id"]
        assert all(0 < len(c) <= 160 for c in e["cues"]), e["exercise_id"]


@pytest.mark.parametrize("entry", plan_seed.EXERCISE_CATALOG, ids=lambda e: e["exercise_id"])
def test_every_catalog_entry_is_accepted_as_an_add_op(entry):
    PlanExerciseOp.model_validate({"op": "add", **entry})


def test_a_swap_from_the_catalog_is_accepted_by_update(client):
    alt = next(e for e in plan_seed.EXERCISE_CATALOG if e["exercise_id"] not in DEFAULT_IDS)
    env = envelope(day("upper_a",
                       {"op": "remove", "exercise_id": "bench_press"},
                       {"op": "add", **alt}))
    assert post(client, env, confirm=True).status_code == 200


def test_catalog_entries_do_not_share_lists_with_the_seed():
    entry = next(e for e in plan_seed.EXERCISE_CATALOG if e["exercise_id"] in DEFAULT_IDS)
    seed = next(ex for d in plan_seed.DEFAULT_PLAN for ex in d["exercises"]
                if ex["exercise_id"] == entry["exercise_id"])
    assert entry["muscles"] is not seed["muscles"]
    assert entry["cues"] is not seed["cues"]


def test_reset_seeds_a_profile_that_has_no_plan_rows(mainmod, client, anon_client, seed_profile_id):
    _, fresh_id = second_profile_client(mainmod, anon_client)
    fresh = plan_rows(mainmod, fresh_id)
    with mainmod.db() as conn:
        conn.execute("DELETE FROM plan_days WHERE profile_id = ?", (seed_profile_id,))
        conn.commit()
    assert plan_rows(mainmod, seed_profile_id) == []
    assert client.post("/api/plan/reset").status_code == 200
    assert plan_rows(mainmod, seed_profile_id) == fresh
