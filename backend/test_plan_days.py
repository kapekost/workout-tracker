"""Add, rename, remove and reorder plan days (#430)."""
import pytest

import plan_seed
from test_plan_update import plan_rows, second_profile_client

DEFAULT_KEYS = [d["day_key"] for d in plan_seed.DEFAULT_PLAN]


def cycle(client):
    return client.get("/api/plan").json()["cycle"]


def add(client, name="Arms", **extra):
    return client.post("/api/plan/days", json={"name": name, **extra})


def add_session(mainmod, profile_id, day_key, completed):
    with mainmod.db() as conn:
        conn.execute("INSERT INTO sessions (date, workout_day, profile_id, completed) "
                     "VALUES ('2026-01-01', ?, ?, ?)", (day_key, profile_id, int(completed)))
        conn.commit()


# --- add ---

def test_add_appends_a_day_with_a_slug_from_the_name(client):
    r = add(client, "Arms & Core!", tag="Biceps", icon="arms")
    assert r.status_code == 201, r.text
    assert r.json()["id"] == "arms_core"
    body = client.get("/api/plan").json()
    assert body["cycle"] == DEFAULT_KEYS + ["arms_core"]
    assert body["plan"]["arms_core"] == {"id": "arms_core", "name": "Arms & Core!", "tag": "Biceps",
                                         "icon": "arms", "exercises": []}


def test_add_appears_in_the_plan_export(client):
    add(client, "Arms")
    assert client.get("/api/plan/export").json()["plan"]["cycle"][-1] == "arms"


def test_add_slug_starts_with_a_letter(client):
    assert add(client, "5x5").json()["id"] == "day_5x5"


@pytest.mark.parametrize("name", ["", "   ", "!!!", "x" * 41])
def test_add_rejects_a_name_with_no_usable_slug_or_too_long(client, name):
    assert add(client, name).status_code in (400, 422)


def test_add_same_name_twice_gets_distinct_keys(client):
    assert add(client, "Arms").json()["id"] == "arms"
    assert add(client, "Arms").json()["id"] == "arms_2"


def test_add_beyond_seven_days_is_refused(client):
    for i in range(3):
        assert add(client, f"Extra {i}").status_code == 201
    assert len(cycle(client)) == 7
    assert add(client, "One too many").status_code == 409


def test_add_never_reuses_the_key_of_a_removed_day_that_has_history(mainmod, client, seed_profile_id):
    assert add(client, "Arms").status_code == 201
    add_session(mainmod, seed_profile_id, "arms", True)
    assert client.delete("/api/plan/days/arms").status_code == 200
    assert add(client, "Arms").json()["id"] == "arms_2"


# --- rename ---

def test_rename_changes_name_tag_icon_but_not_the_key(client):
    r = client.patch("/api/plan/days/upper_a", json={"name": "Push", "tag": "Chest"})
    assert r.status_code == 200, r.text
    day = client.get("/api/plan").json()["plan"]["upper_a"]
    assert (day["id"], day["name"], day["tag"]) == ("upper_a", "Push", "Chest")
    assert cycle(client) == DEFAULT_KEYS


def test_patch_null_clears_tag_and_icon_but_not_name(client):
    assert client.patch("/api/plan/days/upper_a", json={"tag": None, "icon": None}).status_code == 200
    day = client.get("/api/plan").json()["plan"]["upper_a"]
    assert (day["tag"], day["icon"], day["name"]) == (None, None, "Upper A")
    assert client.patch("/api/plan/days/upper_a", json={"name": None}).status_code == 400


def test_patch_with_nothing_to_change_400(client):
    assert client.patch("/api/plan/days/upper_a", json={}).status_code == 400


def test_starting_a_session_on_a_removed_day_400(mainmod, client):
    client.delete("/api/plan/days/lower_b")
    assert client.post("/api/sessions", json={"workout_day": "lower_b"}).status_code == 400


def test_rename_unknown_day_404(client):
    assert client.patch("/api/plan/days/nope", json={"name": "x"}).status_code == 404


def test_rename_rejects_a_blank_name(client):
    assert client.patch("/api/plan/days/upper_a", json={"name": " "}).status_code in (400, 422)


# --- remove ---

def test_remove_drops_the_day_and_its_exercises(mainmod, client, seed_profile_id):
    assert client.delete("/api/plan/days/lower_b").status_code == 200
    assert cycle(client) == DEFAULT_KEYS[:3]
    assert all(row[0] != "lower_b" for row in plan_rows(mainmod, seed_profile_id))


def test_remove_keeps_history_and_the_app_still_lists_it(mainmod, client, seed_profile_id):
    add_session(mainmod, seed_profile_id, "lower_b", True)
    assert client.delete("/api/plan/days/lower_b").status_code == 200
    sessions = client.get("/api/sessions").json()
    assert [s["workout_day"] for s in sessions] == ["lower_b"]


def test_remove_refused_while_a_session_on_that_day_is_open(mainmod, client, seed_profile_id):
    add_session(mainmod, seed_profile_id, "lower_b", False)
    assert client.delete("/api/plan/days/lower_b").status_code == 409
    assert "lower_b" in cycle(client)


def test_remove_allowed_while_a_session_on_another_day_is_open(mainmod, client, seed_profile_id):
    add_session(mainmod, seed_profile_id, "upper_a", False)
    assert client.delete("/api/plan/days/lower_b").status_code == 200


def test_remove_the_last_day_is_refused(client):
    for key in DEFAULT_KEYS[:-1]:
        assert client.delete(f"/api/plan/days/{key}").status_code == 200
    r = client.delete(f"/api/plan/days/{DEFAULT_KEYS[-1]}")
    assert r.status_code == 409
    assert cycle(client) == [DEFAULT_KEYS[-1]]


def test_remove_unknown_day_404(client):
    assert client.delete("/api/plan/days/nope").status_code == 404


def test_remove_keeps_sort_order_gap_free(mainmod, client, seed_profile_id):
    client.delete("/api/plan/days/lower_a")
    with mainmod.db() as conn:
        orders = [r[0] for r in conn.execute(
            "SELECT sort_order FROM plan_days WHERE profile_id = ? ORDER BY sort_order",
            (seed_profile_id,))]
    assert orders == [0, 1, 2]


# --- reorder ---

def test_reorder_sets_the_cycle(client):
    new = ["lower_b", "upper_a", "lower_a", "upper_b"]
    r = client.put("/api/plan/days/order", json={"order": new})
    assert r.status_code == 200, r.text
    assert cycle(client) == new
    assert client.get("/api/plan/export").json()["plan"]["cycle"] == new


@pytest.mark.parametrize("order", [
    ["upper_a", "lower_a", "upper_b"],
    ["upper_a", "lower_a", "upper_b", "lower_b", "extra"],
    ["upper_a", "upper_a", "lower_a", "upper_b"],
    ["upper_a", "lower_a", "upper_b", "nope"],
])
def test_reorder_must_be_exactly_the_current_days(client, order):
    assert client.put("/api/plan/days/order", json={"order": order}).status_code == 400
    assert cycle(client) == DEFAULT_KEYS


# --- other profiles ---

def test_another_profile_cannot_touch_my_days(mainmod, client, anon_client, seed_profile_id):
    other, other_id = second_profile_client(mainmod, anon_client)
    add(client, "Arms")
    before = plan_rows(mainmod, other_id)
    assert other.patch("/api/plan/days/arms", json={"name": "x"}).status_code == 404
    assert other.delete("/api/plan/days/arms").status_code == 404
    assert other.get("/api/plan").json()["cycle"] == DEFAULT_KEYS
    assert plan_rows(mainmod, other_id) == before
    assert "arms" in cycle(client)


def test_two_profiles_can_each_have_the_same_day_key(mainmod, client, anon_client):
    other, _ = second_profile_client(mainmod, anon_client)
    assert add(client, "Arms").json()["id"] == "arms"
    assert add(other, "Arms").json()["id"] == "arms"


def test_days_endpoints_need_a_session(anon_client):
    assert anon_client.post("/api/plan/days", json={"name": "x"}).status_code == 401
    assert anon_client.delete("/api/plan/days/upper_a").status_code == 401
