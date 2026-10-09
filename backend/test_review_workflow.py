"""opencode-review.yml: every model the review loop can run needs its privacy option."""
import json
import re
from pathlib import Path

TEXT = (Path(__file__).resolve().parent.parent / ".github" / "workflows" / "opencode-review.yml").read_text()


def loop_models():
    m = re.search(r"for model in ((?:[\w./:-]+\s*\\?\s*)+);\s*do", TEXT)
    assert m, "review model loop not found"
    return re.findall(r"[\w.-]+/[\w.:-]+", m.group(1))


def configured_models():
    m = re.search(r"cat > opencode\.json <<'JSON'\n(.*?)\n\s*JSON\n", TEXT, re.S)
    assert m, "trusted opencode.json heredoc not found"
    config = json.loads(m.group(1))
    return config["provider"]["openrouter"]["models"]


def test_the_loop_runs_at_least_two_models():
    assert len(loop_models()) >= 2


def test_every_loop_model_is_configured_with_data_collection_deny():
    configured = configured_models()
    for model in loop_models():
        opts = configured.get(model, {}).get("options", {}).get("provider", {})
        assert opts.get("data_collection") == "deny", model


def test_no_configured_model_is_missing_from_the_loop():
    assert set(configured_models()) == set(loop_models())
