from __future__ import annotations

import importlib.util
from pathlib import Path

_SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "risk_distribution_audit.py"
_SPEC = importlib.util.spec_from_file_location("risk_distribution_audit", _SCRIPT)
assert _SPEC is not None and _SPEC.loader is not None
_AUDIT = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(_AUDIT)


def _bundle() -> dict:
    return {
        "schema_version": "replay.viewer-bundle.v1",
        "replay": {"replay_id": "test", "scenario_id": "scenario"},
        "risk": {
            "schema_version": "presentation.risk-overlay.v1",
            "source": {"provenance": ["formal"]},
            "frames": [
                {
                    "valid_time": "2026-08-15T10:00:00Z",
                    "coordinates": {"latitude": [70.0, 70.375], "longitude": [18.0, 19.25]},
                    "risk_levels": [1, 5, 2, 1],
                    "risk_scores": [0.1, None, 0.3, 0.2],
                    "hard_reasons": ["NONE", "LAND", "NONE", "NONE"],
                }
            ],
        },
    }


def test_summary_preserves_published_distribution_and_excludes_unknown_scores() -> None:
    audit = _AUDIT.summarize_bundle(_bundle())
    frame = audit["frames"][0]
    assert frame["level_counts"] == {"1": 2, "2": 1, "3": 0, "4": 0, "5": 1}
    assert frame["hard_reason_counts"] == {"LAND": 1, "NONE": 3}
    assert frame["finite_score_count"] == 3
    assert frame["risk_score_min"] == 0.1
    assert frame["risk_score_max"] == 0.3


def test_render_markdown_explains_hard_level_separation() -> None:
    audit = _AUDIT.summarize_bundle(_bundle())
    report = _AUDIT.render_markdown(audit)
    assert "all `NONE` cells are Level 1" in report
    assert "not a D color-threshold" in report
