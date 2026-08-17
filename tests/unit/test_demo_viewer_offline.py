"""Demo viewer offline/structural checks (no external assets, required DOM)."""

from __future__ import annotations

import shutil
import subprocess
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
    "geo-badge",
    "c-geo",
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


def test_viewer_uses_one_projection_for_cells_and_routes() -> None:
    """Regression: the historical bug drew cells and routes with two different
    transforms, making correct routes appear to cross LAND."""

    html = VIEWER.read_text(encoding="utf-8")
    assert "const project" in html
    assert "project(lon, frame.latitudes[0])[0]" in html
    assert "project(frame.longitudes[0], lat)[1]" in html
    assert "const lonScale" not in html
    assert "const latScale" not in html
    assert "共用同一等比地理投影" in html


def test_viewer_js_syntax() -> None:
    node = shutil.which("node")
    if node is None:
        import pytest

        pytest.skip("node not available")
    html = VIEWER.read_text(encoding="utf-8")
    start = html.rindex("<script>") + len("<script>")
    end = html.rindex("</script>")
    script = html[start:end]
    result = subprocess.run(
        [node, "--check"],
        input=script,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr
