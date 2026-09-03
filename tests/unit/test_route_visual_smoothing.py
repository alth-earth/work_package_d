"""Tests for D's presentation-only screen-space candidate route smoothing."""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest

VIEWER = Path(__file__).resolve().parents[2] / "viewer"
SCRIPT = VIEWER / "route_visual_smoothing.js"


def _run_node_checks() -> None:
    node = shutil.which("node")
    if node is None:
        pytest.skip("node not available")

    source = r'''
const fs = require("fs");
const vm = require("vm");
const context = {window: {}};
vm.runInNewContext(
  fs.readFileSync(process.argv[1], "utf8"),
  context,
  {filename: process.argv[1]},
);
const visual = context.window.ArcticRouteVisualSmoothing;
if (!visual) throw new Error("visual smoothing API is not exported");

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const approx = (actual, expected, message) => {
  assert(Math.abs(actual - expected) <= 1e-9, `${message}: ${actual} != ${expected}`);
};
const kinds = (path) => path.commands.map((item) => item.kind);
const quadratics = (path) => path.commands.filter((item) => item.kind === "quadraticCurveTo");
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

assert(visual.SCHEMA_VERSION === "presentation.route-visual-smoothing.v1", "schema version");
assert(visual.POLICY ===
  "candidate_geometry_screen_space_adaptive_quadratic_display_only", "display-only policy");
assert(visual.DEFAULT_CONFIG.cornerRadiusCssPx === 20, "default CSS radius");
assert(visual.DEFAULT_CONFIG.maxTrimFraction === 0.4, "default trim fraction");

// A right-angle bend is rounded in screen coordinates with the vertex as the
// quadratic control point, while the route endpoints remain exact.
const rightAngleInput = [
  {x: 0, y: 0, label: "origin"},
  {x: 100, y: 0, label: "bend"},
  {x: 100, y: 100, label: "destination"},
];
const rightAngleBefore = JSON.stringify(rightAngleInput);
const rightAngle = visual.buildRoundedPath(rightAngleInput);
assert(rightAngle.applied, "right angle should be rounded");
assert(rightAngle.rounded_corner_count === 1, "one right-angle corner");
assert(rightAngle.skipped_corner_count === 0, "right angle should not be skipped");
assert(rightAngle.fallback_reason === null, "rounded path has no fallback reason");
assert(rightAngle.presentation_only && rightAngle.authoritative_semantics_unchanged,
  "presentation boundary metadata");
assert(JSON.stringify(rightAngleInput) === rightAngleBefore, "input points were mutated");
assert(kinds(rightAngle).join(",") === "moveTo,lineTo,quadraticCurveTo,lineTo",
  "right-angle command sequence");
const rightCurve = quadratics(rightAngle)[0];
approx(rightCurve.cpx, 100, "right-angle control x");
approx(rightCurve.cpy, 0, "right-angle control y");
approx(rightCurve.x, 100, "right-angle exit x");
approx(rightCurve.y, 20, "right-angle exit y");
assert(rightAngle.commands[0].x === 0 && rightAngle.commands[0].y === 0,
  "start endpoint preserved");
const rightEnd = rightAngle.commands[rightAngle.commands.length - 1];
assert(rightEnd.x === 100 && rightEnd.y === 100, "end endpoint preserved");

// Multiple bends must all be visited; no canonical/selected candidate is
// discarded by the display smoother itself.
const continuous = visual.buildRoundedPath([
  {x: 0, y: 0},
  {x: 100, y: 0},
  {x: 100, y: 100},
  {x: 200, y: 100},
]);
assert(continuous.applied, "continuous bends should be rounded");
assert(continuous.rounded_corner_count === 2, "both continuous bends rounded");
assert(quadratics(continuous).length === 2, "two quadratic commands emitted");
assert(continuous.commands[0].kind === "moveTo" &&
  continuous.commands.at(-1).kind === "lineTo", "continuous endpoints emitted");
assert(continuous.commands.at(-1).x === 200 && continuous.commands.at(-1).y === 100,
  "continuous end endpoint preserved");

// A short but usable segment scales the trim down to 40% of each adjacent
// edge, rather than consuming the edge with the nominal 20 CSS-pixel target.
const short = visual.buildRoundedPath([
  {x: 0, y: 0},
  {x: 10, y: 0},
  {x: 10, y: 10},
]);
assert(short.applied && short.rounded_corner_count === 1, "short bend remains usable");
const shortEntry = short.commands[1];
const shortCurve = quadratics(short)[0];
approx(shortEntry.x, 6, "short-edge entry trim");
approx(shortCurve.y, 4, "short-edge exit trim");
const tiny = visual.buildRoundedPath([
  {x: 0, y: 0},
  {x: 1, y: 0},
  {x: 1, y: 1},
]);
assert(!tiny.applied && tiny.fallback_reason === "no_eligible_corner",
  "sub-pixel short bend falls back safely");
assert(kinds(tiny).join(",") === "moveTo,lineTo,lineTo", "short fallback is raw linework");

// Adjacent rounded corners leave a positive straight span on their shared
// short segment; the 40% cap prevents overlapping trims.
const adjacent = visual.buildRoundedPath([
  {x: 0, y: 0},
  {x: 10, y: 0},
  {x: 10, y: 10},
  {x: 20, y: 10},
]);
const adjacentCurves = quadratics(adjacent);
assert(adjacent.applied && adjacentCurves.length === 2, "adjacent short corners rounded");
const firstExit = adjacentCurves[0];
const secondEntry = adjacent.commands[3];
assert(distance(firstExit, secondEntry) > 0, "adjacent trims overlap");
assert(distance(firstExit, secondEntry) >= 10 * (1 - 2 * visual.DEFAULT_CONFIG.maxTrimFraction),
  "adjacent trim exceeds the shared-segment budget");

// Consecutive duplicates within the screen-space tolerance are collapsed,
// while the resulting route can still be rounded.
const duplicateInput = [
  {x: 0, y: 0},
  {x: 100, y: 0},
  {x: 100.2, y: 0},
  {x: 100, y: 100},
];
const duplicateBefore = JSON.stringify(duplicateInput);
const duplicate = visual.buildRoundedPath(duplicateInput);
assert(duplicate.collapsed_duplicate_count === 1, "duplicate point collapsed");
assert(duplicate.source_point_count === 4 && duplicate.display_point_count === 3,
  "duplicate point counts");
assert(duplicate.applied && duplicate.rounded_corner_count === 1,
  "collapsed duplicate retains the bend");
assert(JSON.stringify(duplicateInput) === duplicateBefore, "duplicate input was mutated");

// Near-duplicate samples at the tail may be folded, but the published final
// endpoint itself must never be replaced by the preceding sample.
const nearEnd = visual.buildRoundedPath([
  {x: 0, y: 0},
  {x: 100, y: 0},
  {x: 100, y: 100},
  {x: 100.2, y: 100.1},
]);
const nearEndCommand = nearEnd.commands.at(-1);
approx(nearEndCommand.x, 100.2, "near-duplicate end x");
approx(nearEndCommand.y, 100.1, "near-duplicate end y");

const collinear = visual.buildRoundedPath([
  {x: 0, y: 0},
  {x: 100, y: 0},
  {x: 200, y: 0},
]);
assert(!collinear.applied && collinear.fallback_reason === "no_eligible_corner",
  "collinear route does not invent a corner");
assert(collinear.skipped_corner_count === 1 && quadratics(collinear).length === 0,
  "collinear corner is reported as skipped");

for (const invalidPoints of [
  [{x: 0, y: 0}, {x: NaN, y: 1}, {x: 2, y: 2}],
  [{x: 0, y: 0}, {x: Infinity, y: 1}, {x: 2, y: 2}],
  [{x: 0, y: 0}, {y: 1}, {x: 2, y: 2}],
]) {
  const invalid = visual.buildRoundedPath(invalidPoints);
  assert(!invalid.applied && invalid.fallback_reason === "invalid_point",
    "invalid point fails closed");
  assert(invalid.commands.length === 0 && invalid.display_point_count === 0,
    "invalid route is not partially painted");
  assert(invalid.source_point_count === 3, "invalid source count retained");
}
const invalidCollection = visual.buildRoundedPath(null);
assert(!invalidCollection.applied && invalidCollection.fallback_reason === "invalid_points",
  "non-array points fail closed");

// Scaling projected coordinates and the units-per-CSS-pixel conversion by the
// same factor yields the same path in CSS space.
const basePoints = [
  {x: 0, y: 0},
  {x: 100, y: 0},
  {x: 100, y: 100},
  {x: 200, y: 100},
];
const base = visual.buildRoundedPath(basePoints, {unitsPerCssPixel: 1});
const scale = 2;
const scaled = visual.buildRoundedPath(
  basePoints.map((point) => ({x: point.x * scale, y: point.y * scale})),
  {unitsPerCssPixel: scale},
);
assert(base.applied && scaled.applied, "scaled paths applied");
assert(base.rounded_corner_count === scaled.rounded_corner_count,
  "scaled corner count differs");
assert(base.commands.length === scaled.commands.length, "scaled command count differs");
for (let index = 0; index < base.commands.length; index += 1) {
  const left = base.commands[index];
  const right = scaled.commands[index];
  assert(left.kind === right.kind, `scaled command kind ${index}`);
  for (const key of ["x", "y", "cpx", "cpy"]) {
    if (key in left || key in right) {
      assert(key in left && key in right, `scaled command field ${index}.${key}`);
      approx(right[key] / scale, left[key], `scaled ${index}.${key}`);
    }
  }
}

// trace() must replay every supported command without changing the path
// result; an invalid command is rejected before a stroke can be attempted.
const traceCalls = [];
const context2d = {
  beginPath: () => traceCalls.push(["beginPath"]),
  moveTo: (x, y) => traceCalls.push(["moveTo", x, y]),
  lineTo: (x, y) => traceCalls.push(["lineTo", x, y]),
  quadraticCurveTo: (cpx, cpy, x, y) => traceCalls.push(["quadraticCurveTo", cpx, cpy, x, y]),
};
assert(visual.trace(context2d, rightAngle), "trace accepts rounded path");
assert(traceCalls.length === rightAngle.commands.length + 1, "trace call count");
assert(!visual.trace(context2d, {commands: [{kind: "moveTo", x: 0, y: 0}, {kind: "bogus"}]}),
  "trace rejects unknown command");
'''
    result = subprocess.run(
        [node, "-e", source, str(SCRIPT)],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr or result.stdout


def _input_tag(html: str, input_id: str) -> str:
    marker = f'id="{input_id}"'
    marker_index = html.index(marker)
    start = html.rfind("<input", 0, marker_index)
    end = html.index(">", marker_index) + 1
    return html[start:end]


def test_visual_smoothing_module_covers_geometry_and_display_invariants() -> None:
    _run_node_checks()


def test_viewer_wires_visual_smoothing_layers_and_all_three_objectives() -> None:
    html = (VIEWER / "index.html").read_text(encoding="utf-8")
    embed = (VIEWER / "embed.py").read_text(encoding="utf-8")
    app = (VIEWER / "app.js").read_text(encoding="utf-8")

    smoothing_input = _input_tag(html, "layer-candidate-smoothing")
    raw_input = _input_tag(html, "layer-candidate-polyline")
    assert 'type="checkbox"' in smoothing_input
    assert "checked" in smoothing_input
    assert 'type="checkbox"' in raw_input
    assert "checked" not in raw_input

    visual_script = '<script src="route_visual_smoothing.js"></script>'
    app_script = '<script src="app.js"></script>'
    assert visual_script in html
    assert html.index('route_motion.js') < html.index('runtime_route_candidates.js')
    assert html.index(visual_script) < html.index(app_script)
    assert 'viewer / "route_visual_smoothing.js"' in embed
    assert embed.index('viewer / "route_visual_smoothing.js"') < embed.index(
        'viewer / "app.js"'
    )
    assert visual_script in embed
    assert embed.index(visual_script) < embed.index(app_script)

    start = app.index("function drawResearchCandidateRoutes()")
    end = app.index("\n  function miniProject", start)
    draw_section = app[start:end]
    assert "const visibleCandidates = candidatesForLayer().filter" in draw_section
    assert "for (const candidate of visibleCandidates)" in draw_section
    assert "visibleCandidateObjectives.has(candidate.objective)" in draw_section
    assert "drawCandidateVisualPath" in draw_section
    assert "candidate.candidate_id === canonicalId" not in draw_section
    assert "candidate.candidate_id === runtimeId" not in draw_section
    assert "formalActive" not in draw_section

    styles_start = app.index("const CANDIDATE_STYLES")
    styles_end = app.index(";", styles_start) + 1
    styles = app[styles_start:styles_end]
    for objective in ("fastest", "low_risk", "recommended"):
        assert f"{objective}:" in styles

    assert "candidateOverlayReplacesRoute" in app
    assert "!candidateOverlayReplacesRoute(active)" in app
    assert "candidate_visual_smoothing_enabled: layers.candidateSmoothing" in app
    assert "candidate_raw_polyline_visible: layers.candidatePolyline" in app
    assert "candidate_visual_smoothing:" in app
    assert "routes: candidateVisualDiagnostics()" in app
    assert "setCandidateVisualSmoothing" in app
    assert "setCandidateRawPolylineVisible" in app
    assert "presentation_only: true" in app
    assert "authoritative_semantics_unchanged: true" in app
