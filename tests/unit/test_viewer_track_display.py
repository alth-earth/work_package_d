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
    assert 'policy.source !== "formal_curve_samples"' in segments
    assert "formal_curve_resmoothed: false" in policy
    assert "formal_curve_display_smoothing_applied" in policy
    assert "endpoint_turn_rounding_available" in policy
    assert "completedTrackLookaheadFor" in segments
    assert "endpointLookahead" in segments
    assert "FORMAL_COMPLETED_TRACK_SMOOTHING" in segments
    assert 'engineeringRaw = viewMode === "engineering"' in policy
    assert 'strategy: engineeringRaw' in policy
    assert 'if (viewMode === "engineering") return [{points, smooth: false}];' in segments
    assert 'points: [rawPrefix[rawPrefix.length - 1], ...formalSuffix],\n        smooth: true' in segments
    assert "minimumSpacingCssPx: 56" in app
    assert "cornerRadiusCssPx: 30" in app
    assert "buildEndpointRolePath" in app
    assert "buildProjectedVisualPath" in app
    assert "state.track" not in policy
    assert "state.track =" not in app
