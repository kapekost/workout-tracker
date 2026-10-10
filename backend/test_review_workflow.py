"""opencode-review.yml: the review model list is built in one place with the privacy option."""
import json
import re
import subprocess
from pathlib import Path

TEXT = (Path(__file__).resolve().parent.parent / ".github" / "workflows" / "opencode-review.yml").read_text()


def test_the_config_has_no_hardcoded_models_so_nothing_can_skip_data_collection_deny():
    heredoc = re.search(r"cat > opencode\.json <<'JSON'\n(.*?)\n\s*JSON\n", TEXT, re.S).group(1)
    assert json.loads(heredoc)["provider"]["openrouter"]["models"] == {}


def test_generated_config_denies_data_collection_for_every_listed_model(tmp_path):
    heredoc = re.search(r"cat > opencode\.json <<'JSON'\n(.*?)\n\s*JSON\n", TEXT, re.S).group(1)
    jq_filter = re.search(r"jq --rawfile m \"\$RUNNER_TEMP/models.txt\" \\\n\s*'(.*?)' \\\n", TEXT, re.S).group(1)
    (tmp_path / "opencode.json").write_text(heredoc)
    (tmp_path / "models.txt").write_text("stealth/x-alpha\ncohere/north-mini-code:free\nopenrouter/free\n")
    out = subprocess.run(["jq", "--rawfile", "m", str(tmp_path / "models.txt"), jq_filter, str(tmp_path / "opencode.json")],
                         capture_output=True, text=True, check=True).stdout
    models = json.loads(out)["provider"]["openrouter"]["models"]
    assert list(models) == ["stealth/x-alpha", "cohere/north-mini-code:free", "openrouter/free"]
    assert all(m["options"]["provider"]["data_collection"] == "deny" for m in models.values())


def test_the_loop_runs_the_generated_list_and_reports_the_winner():
    assert 'mapfile -t models < "$RUNNER_TEMP/models.txt"' in TEXT
    assert 'used="$model"; break' in TEXT
    assert "REVIEW_MODEL: ${{ needs.review.outputs.model }}" in TEXT
