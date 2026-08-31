"""Strict D-only reader checks for qualified route-smoothing sidecar v2."""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

VIEWER = Path(__file__).resolve().parents[2] / "viewer"
SCRIPT = VIEWER / "research_route_motion.js"


def _run_node_checks() -> None:
    node = shutil.which("node")
    if node is None:
        pytest.skip("node not available")
    script_path = json.dumps(str(SCRIPT))
    source = r"""
const fs = require("fs");
const vm = require("vm");
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(__SCRIPT_PATH__, "utf8"), context);
const reader = context.window.ArcticRouteResearchMotion;
if (!reader || reader.V2_SCHEMA_VERSION !==
    "c.research-route-smoothing-sidecar.v2") process.exit(1);

const route = {
  route_id: "route-v2-1",
  revision: 7,
  effective_adoption_time: "2026-01-01T00:00:00Z",
  waypoints: [
    {lon: 0.1, lat: 0.2, eta: "2026-01-01T00:00:00Z"},
    {lon: 1.1, lat: 0.2, eta: "2026-01-01T01:00:00Z"},
    {lon: 1.1, lat: 1.2, eta: "2026-01-01T02:00:00Z"},
  ],
};
const rawRouteDigest = reader.canonicalDigest(
  route.waypoints.map((point) => [point.lon, point.lat])
);
const authoritative = {
  route_id: route.route_id,
  route_digest: rawRouteDigest,
  route_digest_scope: "waypoint_coordinates_only",
  waypoint_count: route.waypoints.length,
  waypoints: route.waypoints,
};
const spans = Array.from({length: 4}, (_, index) => ({
  parameter_start: index / 4,
  parameter_end: (index + 1) / 4,
  control_points: [
    {lon: index + 0.1, lat: 0.2},
    {lon: index + 0.2, lat: 0.3},
    {lon: index + 0.3, lat: 0.4},
    {lon: index + 0.4, lat: 0.5},
  ],
}));
const base = {
  schema_version: "c.research-route-smoothing-sidecar.v2",
  policy: "authoritative_waypoints_g2_multispan_cubic_bspline_research_only",
  status: "ACCEPTED",
  applied: true,
  research_only: true,
  research_eligible: true,
  production_qualified: false,
  calibration_status: "NOT_CALIBRATED",
  manoeuvring_qualification: "SYNTHETIC_ONLY",
  experiment_id: "r1-v2-fixture",
  route_id: route.route_id,
  raw_route_digest: rawRouteDigest,
  curve_digest: "c".repeat(64),
  route_identity: {
    route_id: route.route_id,
    route_digest: rawRouteDigest,
    route_digest_scope: "waypoint_coordinates_only",
  },
  plan_revision: route.revision,
  adoption_time: route.effective_adoption_time,
  authoritative_route: authoritative,
  curve_model: {
    degree: 3,
    basis: "clamped_cubic_bspline_cox_de_boor_multispan",
    coordinate_frame: "local_equirectangular_east_north_m",
    knot_vector: [0, 0, 0, 0, 0.25, 0.5, 0.75, 1, 1, 1, 1],
    spans,
  },
  validation: {
    research_gate_passed: true,
    risk_rechecked: true,
    hard_mask_rechecked: true,
    coverage_complete: true,
    eta_recomputed: true,
    speed_checked: true,
    curvature_checked: true,
    corridor_checked: true,
    kinematics_checked: true,
    resource_evidence_complete: true,
    production_qualified: false,
    calibration_status: "NOT_CALIBRATED",
    manoeuvring_qualification: "SYNTHETIC_ONLY",
  },
  motion_samples: [
    {
      lon: 0.1, lat: 0.2, eta: "2026-01-01T00:00:00Z",
      course_degrees: 90.5, speed_knots: 10.25,
    },
    {
      lon: 0.6, lat: 0.2, eta: "2026-01-01T00:30:00Z",
      course_degrees: 90.5, speed_knots: 10.5,
    },
    {
      lon: 1.1, lat: 1.2, eta: "2026-01-01T02:00:00Z",
      course_degrees: 45.25, speed_knots: 9.75,
    },
  ],
  geometry: {segments: [{maximum_deviation_m: 1200}]},
};
base.same_geometry_motion_digest = reader.canonicalDigest({
  curve_digest: base.curve_digest,
  motion_samples: base.motion_samples,
});
base.same_geometry_motion_evidence = {
  same_geometry_motion_digest: base.same_geometry_motion_digest,
  sample_count: base.motion_samples.length,
};
const withDigest = (value) => ({
  ...value,
  sidecar_digest: reader.canonicalDigest(value),
});
const sidecar = withDigest(base);

const accepted = reader.inspect(sidecar, route);
if (!accepted.valid || accepted.schema_version !== reader.V2_SCHEMA_VERSION) process.exit(2);
if (accepted.evidence.schema_version !== reader.V2_SCHEMA_VERSION ||
    !accepted.evidence.digest_valid || accepted.evidence.sample_count !== 3 ||
    accepted.evidence.same_geometry_motion_digest !==
      base.same_geometry_motion_digest) process.exit(3);
const path = reader.buildPath(sidecar, route, Date.parse("2026-01-01T00:00:00Z"));
if (!path || path.points.length !== 3 || path.courseDegrees[1] !== 90.5 ||
    path.speedKnots[2] !== 9.75 || path.source !== "c_research_route_smoothing_sidecar.v2" ||
    path.route_digest !== rawRouteDigest || path.identity.route_digest !== rawRouteDigest ||
    path.sidecar_digest !== sidecar.sidecar_digest ||
    path.same_geometry_motion_digest !== base.same_geometry_motion_digest) process.exit(4);
if (path.timesMs[0] !== 0 || path.timesMs[1] !== 1800000 ||
    path.timesMs[2] !== 7200000 || path.distancesKm[2] <= path.distancesKm[1]) process.exit(5);

const unknownSchema = {...sidecar, schema_version: "c.research-route-smoothing-sidecar.v3"};
if (reader.inspect(unknownSchema, route).reason !== "unsupported_sidecar_schema") process.exit(6);

const staleIdentity = {...sidecar, route_id: "route-stale"};
if (reader.inspect(staleIdentity, route).valid) process.exit(7);

const badDigest = {...sidecar, policy: "tampered"};
if (reader.inspect(badDigest, route).reason !== "sidecar_digest_invalid") process.exit(8);

const badEta = {
  ...sidecar,
  motion_samples: sidecar.motion_samples.map((sample, index) =>
    index === 1 ? {...sample, eta: "2026-01-01T00:00:00Z"} : sample
  ),
};
if (reader.inspect(badEta, route).reason !== "non_monotonic_motion_sample_eta") process.exit(9);

const nonfiniteCourse = {
  ...sidecar,
  motion_samples: sidecar.motion_samples.map((sample, index) =>
    index === 1 ? {...sample, course_degrees: NaN} : sample
  ),
};
if (reader.inspect(nonfiniteCourse, route).reason !== "invalid_motion_sample") process.exit(10);

const nonfiniteSpeed = {
  ...sidecar,
  motion_samples: sidecar.motion_samples.map((sample, index) =>
    index === 1 ? {...sample, speed_knots: Infinity} : sample
  ),
};
if (reader.inspect(nonfiniteSpeed, route).reason !== "invalid_motion_sample") process.exit(11);

const productionQualified = {
  ...sidecar,
  production_qualified: true,
  validation: {...sidecar.validation, production_qualified: true},
};
if (reader.inspect(productionQualified, route).reason !== "production_qualification_forbidden") {
  process.exit(12);
}

if (reader.inspect({...sidecar, calibration_status: "CALIBRATED"}, route).valid) process.exit(13);
if (reader.buildPath(badDigest, route, 0) !== null) process.exit(14);
""".replace("__SCRIPT_PATH__", script_path)
    result = subprocess.run([node, "-e", source], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr or result.stdout


def test_research_sidecar_v2_reader_is_strict_and_normalized() -> None:
    _run_node_checks()
