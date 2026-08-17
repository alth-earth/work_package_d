"""Demo viewer offline/structural checks (no external assets, required DOM)."""

from __future__ import annotations

from pathlib import Path

VIEWER = Path(__file__).parents[2] / "web" / "demo_viewer.html"
REQUIRED_IDS = {
    "mode-badge",
    "scenario-label",
    "tabs",
    "layer-select",
    "objective-select",
    "phase-select",
    "map-mode-select",
    "frame-select",
    "map",
    "legend",
    "before-after",
    "replan-diff",
    "metrics-table",
    "coverage-gate",
    "c-available",
    "c-land",
    "c-unknown",
    "c-other",
    "c-unavail",
    "c-icefree",
    "c-spatial",
    "coverage-note",
    "live-run",
    "live-status",
    "live-progress",
    "tech-info",
}


def test_viewer_has_no_external_runtime_dependency() -> None:
    html = VIEWER.read_text(encoding="utf-8")
    forbidden = [
        '<script src="http',
        '<script src="https',
        "<link",
        "//cdn.",
        "mapbox",
        "openstreetmap",
        "googleapis",
    ]
    assert all(token not in html.lower() for token in forbidden)
    assert "http://www.w3.org/2000/svg" in html  # SVG namespace, not a network call


def test_viewer_has_required_dom_ids() -> None:
    html = VIEWER.read_text(encoding="utf-8")
    missing = [dom_id for dom_id in REQUIRED_IDS if f'id="{dom_id}"' not in html]
    assert missing == []


def test_viewer_marks_result_origin_honestly() -> None:
    html = VIEWER.read_text(encoding="utf-8")
    assert "FROZEN VALIDATED" in html
    assert "LIVE COMPUTED" in html
    assert "不会用旧结果冒充 live" in html
