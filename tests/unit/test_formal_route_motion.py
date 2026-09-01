"""Strict browser-side checks for cd.route-motion-set.v1."""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest

VIEWER = Path(__file__).resolve().parents[2] / "viewer"
RESEARCH_READER = VIEWER / "research_route_motion.js"
FORMAL_READER = VIEWER / "route_motion.js"


def test_formal_motion_reader_is_strict_and_fails_closed() -> None:
    node = shutil.which("node")
    if node is None:
        pytest.skip("node not available")
    source = r"""
const fs = require("fs");
const vm = require("vm");
const {webcrypto} = require("crypto");
const context = {window: {crypto: webcrypto}, TextEncoder};
vm.runInNewContext(fs.readFileSync(process.argv[1], "utf8"), context);
vm.runInNewContext(fs.readFileSync(process.argv[2], "utf8"), context);
const helper = context.window.ArcticRouteResearchMotion;
const reader = context.window.ArcticRouteMotion;
const clone = (value) => JSON.parse(JSON.stringify(value));
const hash = "a".repeat(64);
const layers = [
  "full_voyage", "main_corridor_24_72h", "rolling_0_24h", "executable_0_6h",
];
const waypoints = [
  {lon: 10.0, lat: 70.0, eta: "2026-01-01T00:00:00Z", recommended_speed_mps: 5.0},
  {lon: 11.0, lat: 71.0, eta: "2026-01-01T01:00:00Z", recommended_speed_mps: 5.0},
];
const rawPayload = waypoints.map((point) => ({
  longitude: point.lon, latitude: point.lat, eta: point.eta,
  recommended_speed_mps: point.recommended_speed_mps,
}));
const makeSamples = () => [
  {lon: 10.0, lat: 70.0, eta: "2026-01-01T00:00:00Z",
    course_degrees: 20.0, speed_knots: 9.7},
  {lon: 10.5, lat: 70.6, eta: "2026-01-01T00:30:00Z",
    course_degrees: 30.0, speed_knots: 9.8},
  {lon: 11.0, lat: 71.0, eta: "2026-01-01T01:00:00Z",
    course_degrees: 40.0, speed_knots: 9.9},
];
const makeRecord = (layer, index) => {
  const samples = makeSamples();
  return {
    planning_layer: layer,
    plan_id: `route-v3-sha256-${String(index + 1).repeat(64)}`,
    raw_route_digest: helper.canonicalDigest(rawPayload),
    mode: "CURVE",
    fallback_reason: null,
    curve_digest: helper.canonicalDigestAt(samples.map(({lon, lat}) => [lon, lat]), "coordinates"),
    motion_digest: helper.canonicalDigest(samples),
    interpolation: "linear_time_between_producer_motion_samples",
    waypoint_anchors: [
      {waypoint_index: 0, eta: samples[0].eta, motion_sample_index: 0, arc_length_m: 0.0},
      {waypoint_index: 1, eta: samples[2].eta, motion_sample_index: 2, arc_length_m: 1000.0},
    ],
    motion_samples: samples,
    qualification: {
      result: "QUALIFIED_ENGINEERING_REFERENCE",
      risk_rechecked: true,
      hard_mask_rechecked: true,
      coverage_complete: true,
      eta_anchors_preserved: true,
      speed_checked: true,
      curvature_checked: true,
      corridor_checked: true,
      manoeuvring_checked: true,
      corridor_proof_scope: "CONTINUOUS_IN_DECLARED_RASTER_MODEL",
      evidence_kind: "FORMULA_DERIVED_ENGINEERING_REFERENCE",
      real_vessel_calibrated: false,
      details_digest: hash,
    },
  };
};
const document = {
  schema_version: "cd.route-motion-set.v1",
  motion_set_id: "route-motion-set-sha256-" + "0".repeat(64),
  layer_set_id: "layer-set-1",
  run_id: "run-1",
  scenario_id: "scenario-1",
  corridor_id: "corridor-1",
  generation_id: 1,
  input_revision: 1,
  risk_window_id: "risk-window-1",
  risk_window_digest: hash,
  vessel_profile_id: "nordic_odyssey_reference_v1",
  vessel_profile_version: "formula_reference_v1",
  vessel_profile_digest: hash,
  motion_profile_id: "nordic_odyssey_formula_reference_v1",
  motion_profile_digest: hash,
  config_digest: hash,
  model_config_digest: hash,
  planner_config_digest: hash,
  producer_digest: hash,
  generated_at: "2026-01-01T00:00:00Z",
  records: layers.map(makeRecord),
};
const seal = (value) => {
  const payload = clone(value);
  delete payload.motion_set_id;
  value.motion_set_id = `route-motion-set-sha256-${helper.canonicalDigest(payload)}`;
  return value;
};
seal(document);
const route = {
  route_id: document.records[0].plan_id,
  effective_adoption_time: waypoints[0].eta,
  waypoints,
};
const bundle = {
  combined_presentation: {
    route_motion_set_ids: [document.motion_set_id],
    route_motion_set_bindings: [{
      motion_set_id: document.motion_set_id,
      layer_set_id: document.layer_set_id,
      risk_window_id: document.risk_window_id,
      risk_window_digest: document.risk_window_digest,
    }],
    layer_set_id: document.layer_set_id,
    risk_window_id: document.risk_window_id,
    risk_window_digest: document.risk_window_digest,
  },
  route_motion_sets: [document],
};
if (!reader.inspectSet(document).valid) process.exit(1);
const inspection = reader.inspect(bundle, route);
if (!inspection.valid || inspection.source !== "cd.route-motion-set.v1") process.exit(2);
const path = reader.buildPath(bundle, route, Date.parse(waypoints[0].eta));
if (!path || path.points.length !== 3 || path.courseDegrees[1] !== 30.0 ||
    path.speedKnots[2] !== 9.9 || path.timesMs[1] !== 1800000 ||
    !Number.isFinite(path.minimumRadiusM) || !Number.isFinite(path.maximumDeviationM) ||
    path.curvatureSampleCount !== 1 ||
    path.diagnosticsSource !== "formal_motion_samples_vs_authoritative_waypoints") process.exit(3);

const tampered = clone(document);
tampered.records[0].motion_samples[1].lat += 0.1;
if (reader.inspectSet(tampered).valid) process.exit(4);
const speedDrift = clone(route);
speedDrift.waypoints[0].recommended_speed_mps = 4.0;
if (reader.inspect(bundle, speedDrift).valid) process.exit(5);
const staleBundle = clone(bundle);
staleBundle.combined_presentation.route_motion_set_bindings[0].risk_window_digest = "b".repeat(64);
if (reader.inspect(staleBundle, route).valid) process.exit(6);
const nonMonotonic = clone(document);
nonMonotonic.records[0].motion_samples[1].eta = nonMonotonic.records[0].motion_samples[0].eta;
nonMonotonic.records[0].motion_digest = helper.canonicalDigest(
  nonMonotonic.records[0].motion_samples
);
seal(nonMonotonic);
if (reader.inspectSet(nonMonotonic).valid) process.exit(7);
const passthrough = clone(document);
const record = passthrough.records[0];
record.mode = "RAW_PASSTHROUGH";
record.fallback_reason = "continuous_corridor_unknown";
record.qualification.result = "RAW_FALLBACK";
for (const name of ["risk_rechecked", "hard_mask_rechecked", "coverage_complete",
  "eta_anchors_preserved", "speed_checked", "curvature_checked", "corridor_checked",
  "manoeuvring_checked"]) record.qualification[name] = false;
seal(passthrough);
const passthroughBundle = clone(bundle);
passthroughBundle.route_motion_sets = [passthrough];
passthroughBundle.combined_presentation.route_motion_set_ids = [passthrough.motion_set_id];
passthroughBundle.combined_presentation.route_motion_set_bindings[0].motion_set_id =
  passthrough.motion_set_id;
const fallback = reader.inspect(passthroughBundle, route);
if (fallback.valid || fallback.reason !== "continuous_corridor_unknown") process.exit(8);

const revision2 = clone(document);
revision2.layer_set_id = `layer-set-sha256-${"c".repeat(64)}`;
revision2.generation_id = 2;
revision2.input_revision = 2;
revision2.records.forEach((item, index) => {
  item.plan_id = `route-v3-sha256-${String(index + 5).repeat(64)}`;
});
seal(revision2);
const route2 = {...clone(route), route_id: revision2.records[0].plan_id};
const revisionBundle = clone(bundle);
revisionBundle.route_motion_sets.push(revision2);
revisionBundle.combined_presentation.route_motion_set_ids.push(revision2.motion_set_id);
revisionBundle.combined_presentation.route_motion_set_bindings.push({
  motion_set_id: revision2.motion_set_id,
  layer_set_id: revision2.layer_set_id,
  risk_window_id: revision2.risk_window_id,
  risk_window_digest: revision2.risk_window_digest,
});
if (!reader.inspect(revisionBundle, route2).valid) process.exit(9);
route2.effective_adoption_time = waypoints[1].eta;
if (reader.inspect(revisionBundle, route2).valid) process.exit(10);
(async () => {
  const asyncBundle = clone(bundle);
  const results = await reader.prevalidate(asyncBundle);
  if (!results[0].valid || !Object.isFrozen(asyncBundle.route_motion_sets[0]) ||
      !reader.buildPath(asyncBundle, route, Date.parse(waypoints[0].eta))) process.exit(11);

  // A failed async inspection must not leave a verification marker behind.
  // Otherwise a later mutation could bypass the canonical digest checks.
  const invalidAfterDigest = clone(bundle);
  const invalidSet = invalidAfterDigest.route_motion_sets[0];
  invalidSet.records[0].qualification.result = "BROKEN";
  const invalidPayload = clone(invalidSet);
  delete invalidPayload.motion_set_id;
  invalidSet.motion_set_id = `route-motion-set-sha256-${helper.canonicalDigest(invalidPayload)}`;
  const invalidResults = await reader.prevalidate(invalidAfterDigest);
  if (invalidResults[0].valid) process.exit(13);
  invalidSet.records[0].qualification.result = "QUALIFIED_ENGINEERING_REFERENCE";
  invalidSet.records[0].motion_samples[1].lat += 0.1;
  if (reader.inspectSet(invalidSet).valid) process.exit(14);
})().catch((error) => {
  console.error(error);
  process.exit(12);
});
"""
    result = subprocess.run(
        [node, "-e", source, str(RESEARCH_READER), str(FORMAL_READER)],
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr or result.stdout


def test_formal_reader_loads_before_viewer_and_is_embedded() -> None:
    html = (VIEWER / "index.html").read_text(encoding="utf-8")
    embed = (VIEWER / "embed.py").read_text(encoding="utf-8")
    assert '<script src="route_motion.js"></script>' in html
    assert html.index('route_motion.js') < html.index('app.js')
    assert 'viewer / "route_motion.js"' in embed
    assert '<script src="route_motion.js"></script>' in embed


def test_production_motion_uses_formal_samples_or_raw_timeline_only() -> None:
    app = (VIEWER / "app.js").read_text(encoding="utf-8")
    assert 'path?.source === "cd.route-motion-set.v1"' in app
    assert '"formal_route_motion"' in app
    assert "formal_motion_inspection" in app
    assert "buildFormalRouteMotionPath" in app
    assert "return formal?.points || route.waypoints;" in app
    assert 'viewMode = "presentation";' in app
    assert "researchRouteSmoothingEnabled" not in app
    assert "buildResearchRouteMotionPath" not in app
    assert "setResearchRouteSmoothing" not in app
    assert "production_research_path_removed" in app
    assert "timeline-unavailable" in app


def test_current_segment_and_curve_diagnostics_are_independent_of_raw_polyline_layer() -> None:
    app = (VIEWER / "app.js").read_text(encoding="utf-8")
    stylesheet = (VIEWER / "style.css").read_text(encoding="utf-8")
    assert "currentSegmentPaintPointsAt" in app
    assert 'drawPath(currentSegment, "#f7fbff", 3.1' in app
    assert "const currentSegment = currentSegmentPaintPointsAt(active, s);" in app
    assert "minimum_radius_m" in app
    assert "maximum_deviation_m" in app
    assert "overflow-x: auto" in stylesheet
    assert "flex: 0 0 var(--risk-tick-width, 8px)" in stylesheet
    assert "min-width: 3px" in stylesheet
