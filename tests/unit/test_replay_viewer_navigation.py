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


def test_cross_package_snapshot_and_optional_selection_rationale_are_exposed() -> None:
    html = (VIEWER / "index.html").read_text(encoding="utf-8")
    script = (VIEWER / "app.js").read_text(encoding="utf-8")
    stylesheet = (VIEWER / "style.css").read_text(encoding="utf-8")

    assert 'id="decision-snapshot-heading"' in html
    for package in "abcd":
        assert f'id="snapshot-{package}-value"' in html
    assert 'id="selection-rationale-status"' in html
    assert 'id="selection-rationale-metrics"' in html
    assert "function updateDecisionSnapshot" in script
    assert "function updateSelectionRationale" in script
    assert 'schema_version !== "selection-rationale.v1"' in script
    assert "displayRouteForState" in script
    assert ".decision-grid" in stylesheet
    assert ".selection-rationale" in stylesheet


def test_engineering_debug_is_reached_by_the_dedicated_button_only() -> None:
    html = (VIEWER / "index.html").read_text(encoding="utf-8")
    script = (VIEWER / "app.js").read_text(encoding="utf-8")

    assert 'option value="engineering"' not in html
    assert 'id="toggle-debug"' in html
    assert "viewModeSel.disabled = engineeringMode" in script
    assert '["research", "presentation"].includes(requested)' in script


def test_runtime_lock_preserves_route_identity_but_not_display_filters() -> None:
    """Regression for the run-state UI lock coupling.

    Playback must keep the selected C runtime candidate fixed, while the
    research layer/objective controls remain display-only and usable.
    """

    script = (VIEWER / "app.js").read_text(encoding="utf-8")
    runtime_ui_start = script.index("function updateRuntimeRouteUi()")
    runtime_ui_end = script.index("function setRuntimeRouteCandidate", runtime_ui_start)
    runtime_ui = script[runtime_ui_start:runtime_ui_end]

    assert "const researchAvailable = Boolean(candidateInspection?.valid);" in runtime_ui
    assert "routeLayerSel.disabled = !researchAvailable;" in runtime_ui
    assert "routeObjectiveFiltersEl.disabled = !researchAvailable;" in runtime_ui
    assert (
        "routeLayerSel.disabled = !candidateInspection?.valid || runtimeRouteLocked"
        not in script
    )
    assert "routeObjectiveFiltersEl.disabled = runtimeRouteLocked" not in script

    layer_start = script.index('routeLayerSel.addEventListener("change"')
    layer_end = script.index("routeCandidatesEl.addEventListener", layer_start)
    assert "if (runtimeRouteLocked)" not in script[layer_start:layer_end]

    objective_start = script.index("routeObjectiveFiltersEl?.addEventListener")
    objective_end = script.index("eventTimelineEl.addEventListener", objective_start)
    assert "if (runtimeRouteLocked) return" not in script[objective_start:objective_end]

    play_start = script.index("playBtn.addEventListener")
    play_end = script.index("resetRouteBtn?.addEventListener", play_start)
    assert "runtimeRouteLocked = true" in script[play_start:play_end]
    assert "runtimeRouteMotionMode = runtimeMotionModeFor(candidate)" in script[play_start:play_end]
    assert "runtimeControls: () =>" in script
    assert "runtime_route_locked: runtimeRouteLocked" in script
    assert "runtime_candidate_selection_locked: runtimeRouteLocked" in script
    assert "runButton.disabled = !runnable || runtimeRouteLocked" in script
