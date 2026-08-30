"""Structural regressions for bundle-only professional navigation aids."""

from __future__ import annotations

from pathlib import Path

VIEWER = Path(__file__).resolve().parents[2] / "viewer"


def test_navigation_aids_are_available_and_enabled_by_default() -> None:
    html = (VIEWER / "index.html").read_text(encoding="utf-8")
    script = (VIEWER / "app.js").read_text(encoding="utf-8")
    assert 'id="layer-navigation" type="checkbox" checked' in html
    assert "navigation: true" in script
    assert 'basemap?.projection' in script
    assert 'basemap?.bbox' in script


def test_navigation_aids_share_the_canonical_projection() -> None:
    script = (VIEWER / "app.js").read_text(encoding="utf-8")
    navigation = script[script.index("function drawNavigationAids") : script.index(
        "function coordinateOf"
    )]
    assert "project(lon, bounds.max_lat)" in navigation
    assert "project(bounds.min_lon, lat)" in navigation
    assert "haversineKm" in navigation
    assert "grid north, not a magnetic bearing" in navigation
    assert "fetch(" not in navigation


def test_navigation_aids_render_above_risk_and_below_routes() -> None:
    script = (VIEWER / "app.js").read_text(encoding="utf-8")
    draw = script[script.index("function draw()") : script.index("function drawShipIcon")]
    assert draw.index("drawRiskFrame") < draw.index("drawNavigationAids")
    assert draw.index("drawNavigationAids") < draw.index("drawPath")


def test_presentation_mode_hides_engineering_gate_badges() -> None:
    stylesheet = (VIEWER / "style.css").read_text(encoding="utf-8")
    assert ".badges[hidden]" in stylesheet
    assert "display: none" in stylesheet[stylesheet.index(".badges[hidden]") :]


def test_canvas_preserves_the_canonical_map_aspect_ratio() -> None:
    stylesheet = (VIEWER / "style.css").read_text(encoding="utf-8")
    map_style = stylesheet[stylesheet.index("#map {") : stylesheet.index(".hover-info")]
    assert "object-fit: contain" in map_style
    assert "object-position: center" in map_style


def test_paused_viewer_does_not_redraw_the_full_canvas_every_animation_frame() -> None:
    script = (VIEWER / "app.js").read_text(encoding="utf-8")
    frame = script[script.index("function frame(ts)") : script.index(
        "playBtn.addEventListener"
    )]

    assert "const shouldDraw = playing || lastTs === null" in frame
    assert "if (shouldDraw)" in frame
    assert frame.index("if (shouldDraw)") < frame.index("draw();")


def test_rehearsal_controls_seek_milestones_and_reset_map_view() -> None:
    html = (VIEWER / "index.html").read_text(encoding="utf-8")
    script = (VIEWER / "app.js").read_text(encoding="utf-8")
    stylesheet = (VIEWER / "style.css").read_text(encoding="utf-8")

    assert 'id="reset-map"' in html
    assert 'id="event-timeline"' in html
    assert "event-jump" in script
    assert "seekSimulationToIso" in script
    assert 'setAttribute("aria-current", "step")' in script
    assert "mapPanX = 0" in script
    assert ".event-jump:focus-visible" in stylesheet
