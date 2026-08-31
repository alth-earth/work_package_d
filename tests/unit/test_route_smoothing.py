"""Display-only constrained cubic B-spline route rendering checks."""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

VIEWER = Path(__file__).resolve().parents[2] / "viewer"
SCRIPT = VIEWER / "route_smoothing.js"
RESEARCH_MOTION_SCRIPT = VIEWER / "research_route_motion.js"


def _run_node_checks() -> None:
    node = shutil.which("node")
    if node is None:
        pytest.skip("node not available")
    script_path = json.dumps(str(SCRIPT))
    source = """
const fs = require("fs");
const vm = require("vm");
const context = {{ window: {{}} }};
vm.runInNewContext(fs.readFileSync(__SCRIPT_PATH__, "utf8"), context);
const smoother = context.window.ArcticRouteSmoothing;
if (!smoother || smoother.POLICY !==
    "authoritative_waypoints_constrained_local_cubic_bspline_display_only") process.exit(1);

const authoritative = [
  {{lon: 0, lat: 0, eta: "2026-01-01T00:00:00Z"}},
  {{lon: 1, lat: 0, eta: "2026-01-01T01:00:00Z"}},
  {{lon: 1, lat: 1, eta: "2026-01-01T02:00:00Z"}},
];
const authoritativeBefore = JSON.stringify(authoritative);
const corner = smoother.smoothDisplayPoints(authoritative);
if (JSON.stringify(authoritative) !== authoritativeBefore) process.exit(13);
if (!corner.applied || corner.smoothed_corner_count !== 1) process.exit(2);
if (corner.points[0].lon !== 0 || corner.points[0].lat !== 0) process.exit(3);
const end = corner.points[corner.points.length - 1];
if (end.lon !== 1 || end.lat !== 1) process.exit(4);
if (corner.display_point_count <= corner.raw_point_count) process.exit(5);
if (corner.maximum_deviation_m > smoother.DEFAULT_CONFIG.maxDeviationM) process.exit(6);
if (corner.minimum_curve_radius_m <
    smoother.DEFAULT_CONFIG.nominalRadiusM * smoother.DEFAULT_CONFIG.curvatureTolerance) {
  process.exit(7);
}
if (Object.keys(corner.points[0]).sort().join(",") !== "lat,lon") process.exit(8);

const straight = smoother.smoothDisplayPoints([
  {{lon: 0, lat: 0}},
  {{lon: 1, lat: 0}},
  {{lon: 2, lat: 0}},
]);
if (straight.applied || straight.fallback_reason !== "no_eligible_corner") process.exit(9);

const duplicate = smoother.smoothDisplayPoints([
  {{lon: 0, lat: 0}},
  {{lon: 1, lat: 0}},
  {{lon: 1, lat: 0}},
  {{lon: 2, lat: 1}},
]);
if (duplicate.applied || duplicate.fallback_reason !== "duplicate_point") process.exit(10);

const constrained = smoother.smoothDisplayPoints([
  {{lon: 0, lat: 0}},
  {{lon: 1, lat: 0}},
  {{lon: 1, lat: 1}},
], {{maxDeviationM: 1}});
if (constrained.applied || constrained.fallback_reason !== "all_curves_rejected") process.exit(14);

const invalid = smoother.smoothDisplayPoints([
  {{lon: 0, lat: 0}},
  {{lon: 1, lat: 0}},
  {{lon: 181, lat: 1}},
]);
if (invalid.applied || invalid.fallback_reason !== "invalid_coordinate") process.exit(15);

const zigzag = smoother.smoothDisplayPoints([
  {{lon: 0, lat: 0}},
  {{lon: 1, lat: 0}},
  {{lon: 1, lat: 1}},
  {{lon: 2, lat: 1}},
]);
if (!zigzag.applied || zigzag.smoothed_corner_count !== 2) process.exit(11);
const zigzagEnd = zigzag.points[zigzag.points.length - 1];
if (zigzagEnd.lon !== 2 || zigzagEnd.lat !== 1) process.exit(12);
""".replace("__SCRIPT_PATH__", script_path).replace("{{", "{").replace("}}", "}")
    result = subprocess.run([node, "-e", source], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr or result.stdout


def _run_research_motion_checks() -> None:
    node = shutil.which("node")
    if node is None:
        pytest.skip("node not available")
    script_path = json.dumps(str(RESEARCH_MOTION_SCRIPT))
    source = """
const fs = require("fs");
const vm = require("vm");
const context = {{ window: {{}} }};
vm.runInNewContext(fs.readFileSync(__SCRIPT_PATH__, "utf8"), context);
const reader = context.window.ArcticRouteResearchMotion;
if (!reader || reader.SCHEMA_VERSION !== "c.research-route-smoothing-sidecar.v1") process.exit(1);
const route = {{
  route_id: "route-1",
  waypoints: [
    {{lon: 0, lat: 0, eta: "2026-01-01T00:00:00Z"}},
    {{lon: 1, lat: 0, eta: "2026-01-01T01:00:00Z"}},
  ],
}};
const sidecar = {{
  schema_version: "c.research-route-smoothing-sidecar.v1",
  route_id: "route-1",
  raw_route_digest: "a".repeat(64),
  research_only: true,
  research_eligible: true,
  status: "ACCEPTED",
  applied: true,
  plan_revision: null,
  adoption_time: null,
  validation: {{
    research_gate_passed: true,
    risk_rechecked: true,
    hard_mask_rechecked: true,
    coverage_complete: true,
    eta_recomputed: true,
    speed_checked: true,
  }},
  sidecar_digest: "b".repeat(64),
  authoritative_route: {{
    route_digest: "a".repeat(64),
    waypoints: route.waypoints,
  }},
  geometry: {{segments: [{{maximum_deviation_m: 100}}]}},
  motion_samples: [
    {{lon: 0, lat: 0, eta: "2026-01-01T00:00:00Z"}},
    {{lon: 0.5, lat: 0.1, eta: "2026-01-01T00:30:00Z"}},
    {{lon: 1, lat: 0, eta: "2026-01-01T01:00:00Z"}},
  ],
}};
const inspection = reader.inspect(sidecar, route);
if (!inspection.valid || inspection.samples.length !== 3) process.exit(2);
const path = reader.buildPath(sidecar, route, Date.parse("2026-01-01T00:00:00Z"));
if (!path || path.points.length !== 3 ||
    path.source !== "c_research_route_smoothing_sidecar") process.exit(3);
if (path.timesMs[1] !== 1800000 || path.distancesKm[2] <= path.distancesKm[1]) process.exit(4);
if (reader.inspect(sidecar, {{...route, route_id: "other"}}).valid) process.exit(5);
const fallback = {{...sidecar, status: "FALLBACK", applied: false, fallback_reason: "rejected"}};
if (reader.inspect(fallback, route).valid ||
    reader.buildPath(fallback, route, 0) !== null) process.exit(6);
const unqualified = {{...sidecar, research_eligible: false}};
if (reader.inspect(unqualified, route).reason !== "research_gate_not_passed") process.exit(7);
const revisionRoute = {{...route, revision: 1, effective_adoption_time: "2026-01-01T00:00:00Z"}};
const revisionDrift = {{...sidecar, plan_revision: 2}};
if (reader.inspect(revisionDrift, revisionRoute).reason !==
    "plan_revision_mismatch") process.exit(8);
const adoptionDrift = {{...sidecar, adoption_time: "2026-01-01T00:01:00Z"}};
if (reader.inspect(adoptionDrift, revisionRoute).reason !==
    "adoption_time_mismatch") process.exit(9);
""".replace("__SCRIPT_PATH__", script_path).replace("{{", "{").replace("}}", "}")
    result = subprocess.run([node, "-e", source], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr or result.stdout


def test_route_smoothing_is_loaded_before_the_viewer_application() -> None:
    html = (VIEWER / "index.html").read_text(encoding="utf-8")
    assert '<script src="route_smoothing.js"></script>' in html
    assert html.index('route_smoothing.js') < html.index('app.js')


def test_route_smoothing_is_inlined_for_offline_viewer() -> None:
    embed = (VIEWER / "embed.py").read_text(encoding="utf-8")
    assert 'viewer / "route_smoothing.js"' in embed
    assert '<script src="route_smoothing.js"></script>' in embed
    assert 'viewer / "research_route_motion.js"' in embed
    assert '<script src="research_route_motion.js"></script>' in embed


def test_route_smoothing_keeps_route_and_vessel_semantics_separate() -> None:
    app = (VIEWER / "app.js").read_text(encoding="utf-8")
    assert "routeDisplayPoints" in app
    assert "smoothRoute = false" in app
    assert "routeMotionPointAt" in app
    assert "routeMotionPaintPointsAt(active, simMs)" in app
    assert "linearVesselPointAt" in app
    assert "activeRevisionAt" in app
    assert "drawPath(s.trail" in app
    assert 'drawPath(s.track, "#5cc47a", 3, [], null, 1, true)' in app
    assert "shipHeading(s, active)" in app
    assert "vesselPointAt(ms)" in app


def test_curve_is_primary_route_layer_and_raw_polyline_is_optional() -> None:
    html = (VIEWER / "index.html").read_text(encoding="utf-8")
    stylesheet = (VIEWER / "style.css").read_text(encoding="utf-8")
    app = (VIEWER / "app.js").read_text(encoding="utf-8")

    assert 'id="layer-route-polyline" type="checkbox" />' in html
    assert "原始权威路径（默认隐藏）" in html
    assert "routePolyline: false" in app
    assert "ROUTE_CURVE_COLOR = \"#49a9ed\"" in app
    assert "ROUTE_POLYLINE_COLOR" in app
    assert ".sw-active" in stylesheet
    assert "background: #49a9ed" in stylesheet
    assert ".sw-route-polyline" in stylesheet
    assert "drawRoutePolyline" in app


def test_research_sidecar_motion_is_explicit_and_default_off() -> None:
    html = (VIEWER / "index.html").read_text(encoding="utf-8")
    app = (VIEWER / "app.js").read_text(encoding="utf-8")
    assert 'id="route-smoothing-research" type="checkbox"' in html
    assert "启用研究曲线运动（默认关闭）" in html
    assert "let researchRouteSmoothingEnabled = false;" in app
    assert "researchRouteSmoothingEnabled = false;" in app
    assert "buildResearchRouteMotionPath" in app
    assert "motion_source" in app
    assert "timeline_fallback" in app


def test_display_smoother_passes_synthetic_geometry_and_fail_closed_cases() -> None:
    _run_node_checks()


def test_research_sidecar_reader_passes_synthetic_identity_and_eta_checks() -> None:
    _run_research_motion_checks()
