"""Focused regression tests for presentation timed-path clipping."""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest

VIEWER = Path(__file__).resolve().parents[2] / "viewer"


def test_clip_timed_path_interpolates_and_hides_after_arrival() -> None:
    node = shutil.which("node")
    if node is None:
        pytest.skip("node not available")
    source = r'''
const fs = require("fs");
const vm = require("vm");
const context = {window: {}};
vm.runInNewContext(fs.readFileSync(process.argv[1], "utf8"), context);
const api = context.window.ArcticRouteVisualSmoothing;
if (!api || typeof api.clipTimedPath !== "function") throw new Error("timed API missing");
if (typeof api.buildRolePath !== "function") throw new Error("role path API missing");
const assert = (value, message) => { if (!value) throw new Error(message); };
const points = [
  {lon: 0, lat: 0, eta: "2026-01-01T00:00:00.000Z"},
  {lon: 10, lat: 0, eta: "2026-01-01T01:00:00.000Z"},
  {lon: 10, lat: 10, eta: "2026-01-01T02:00:00.000Z"},
];
const before = JSON.stringify(points);
const start = api.clipTimedPath(points, Date.parse("2025-12-31T23:00:00Z"));
assert(start.valid && start.visible && start.remaining_point_count === 3, "before start");
const middle = api.clipTimedPath(points, Date.parse("2026-01-01T00:30:00Z"));
assert(middle.valid && middle.visible && middle.interpolated, "midpoint visible");
assert(middle.points.length === 3 && middle.points[0].lon === 5, "midpoint interpolation");
const exact = api.clipTimedPath(points, Date.parse("2026-01-01T01:00:00Z"));
assert(exact.visible && !exact.interpolated && exact.points.length === 2, "exact waypoint");
const arrived = api.clipTimedPath(points, Date.parse("2026-01-01T02:00:00Z"));
assert(arrived.valid && !arrived.visible && arrived.hidden_reason === "arrived", "arrival hidden");
const mismatch = api.clipTimedPath(points, Date.now(), {
  identity: {revision: 1, layer_set_id: "a", candidate_id: "b", objective: "fastest"},
  expectedIdentity: {revision: 2, layer_set_id: "a", candidate_id: "b", objective: "fastest"},
});
assert(!mismatch.valid && mismatch.hidden_reason === "identity_mismatch", "identity fail closed");
assert(JSON.stringify(points) === before, "source points mutated");
const rounded = api.buildRolePath(
  [{x: 0, y: 0}, {x: 10, y: 0}, {x: 10, y: 10}],
  "completed_track_raw",
);
assert(rounded.role === "completed_track_raw" && rounded.applied, "role path rounding");
const rejected = api.buildRolePath([{x: 0, y: 0}, {x: 1, y: 1}], "formal_curve");
assert(!rejected.applied && rejected.fallback_reason === "unsupported_role", "role fail closed");
'''
    result = subprocess.run(
        [node, "-e", source, str(VIEWER / "route_visual_smoothing.js")],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr or result.stdout
