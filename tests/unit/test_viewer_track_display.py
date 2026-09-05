"""Focused regressions for the Viewer completed-track presentation policy."""

from __future__ import annotations

from pathlib import Path

VIEWER = Path(__file__).resolve().parents[2] / "viewer"


def test_valid_candidate_view_is_the_static_initial_mode() -> None:
    html = (VIEWER / "index.html").read_text(encoding="utf-8")
    app = (VIEWER / "app.js").read_text(encoding="utf-8")

    assert '<body data-mode="research">' in html
    assert '<span id="mode-badge" class="badge">研究验证</span>' in html
    assert '<option value="research" selected>研究验证</option>' in html
    assert '<option value="presentation">航行仿真</option>' in html
    assert 'id="mini-map-panel"' in html
    assert 'id="mini-map"' in html
    assert 'let viewMode = "research";' in app
    assert 'let previousNonEngineeringMode = "research";' in app
    assert 'viewMode = candidateInspection.valid ? "research" : "presentation";' in app
    assert "researchPanel.hidden = viewMode !== \"research\"" in app


def test_completed_track_rounding_is_paint_only_and_mode_bound() -> None:
    app = (VIEWER / "app.js").read_text(encoding="utf-8")
    main_draw = app[app.index("function draw()") : app.index("function drawShipIcon")]
    mini_draw = app[app.index("function drawMiniMap") : app.index("function draw()")]
    policy = app[app.index("function completedTrackPresentationPolicy") : app.index(
        "function completedTrackSegments"
    )]
    segments = app[app.index("function completedTrackSegments") : app.index(
        "function strokeDisplayPath"
    )]

    assert 'drawCompletedTrack(s.track, active, "#5cc47a", 3, [], 1)' in main_draw
    assert 'drawMiniCompletedTrack(state.track, active, "#69d49c", 2.2, [], 0.94)' in mini_draw
    assert "authoritativeCompletedRoutePointsAt" in app
    assert "authoritative_prefix_recolored: !engineeringRaw" in policy
    assert "authoritative_route_prefix_recolored_eta_clipped_display" in policy
    assert "smoothing_applied: false" in policy
    assert "formal_curve_resmoothed: false" in policy
    assert "formal_curve_display_smoothing_applied: false" in policy
    assert "endpoint_turn_rounding_available" in policy
    assert "completedTrackLookaheadFor" in policy
    assert "vesselPointAt(relativeMs)" in app
    assert "eta: new Date(target).toISOString()" in app
    assert ".filter((point) => isoToMs(point?.eta) < target)" in app
    assert "const beforeArrival = !Number.isFinite(finalPointMs) || target < finalPointMs;" in app
    assert "if (!beforeArrival)" in app
    assert "formalPathValid && target >= path.timesMs[path.timesMs.length - 1]" in app
    assert "endpointLookahead" in segments
    assert 'engineeringRaw = viewMode === "engineering"' in policy
    assert 'strategy: engineeringRaw' in policy
    assert 'if (viewMode === "engineering") return [{points, smooth: false}];' in segments
    assert "same authoritative prefix" in segments
    assert "position is included by ETA interpolation" in segments
    assert "visible" in segments
    assert "points: visible.length >= 2 ? visible : points" in segments
    assert "endpointLookahead: null" in segments
    assert "smooth: false" in segments
    assert "minimumSpacingCssPx: 24" in app
    assert "cornerRadiusCssPx: 30" in app
    assert "buildEndpointRolePath" in app
    assert "buildProjectedVisualPath" in app
    assert "state.track" not in policy
    assert "state.track =" not in app
