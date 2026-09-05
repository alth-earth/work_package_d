"""Focused regressions for the temporal candidate-route Viewer repair.

The browser owns the presentation state, but candidate temporal clipping is a
small pure operation.  These tests intentionally call the public visual
smoothing helper rather than importing app.js or depending on DOM details.

The v2 bundle is an existing, read-only artifact.  The tests skip when that
artifact is not present (as they do for the other real-artifact regressions).
No test writes to or mutates the bundle.
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest

VIEWER = Path(__file__).resolve().parents[2] / "viewer"
V2_BUNDLE_CANDIDATES = (
    *(
        ancestor / "work_package_d/output/winter-rebuilt-20260215-viewer-package-v2/bundle.json"
        for ancestor in Path(__file__).resolve().parents
    ),
)


def _v2_bundle() -> Path:
    for path in V2_BUNDLE_CANDIDATES:
        if path.exists():
            return path
    pytest.skip("v2 Viewer bundle is not available in this checkout")


def _run_node(source: str, *args: Path) -> None:
    node = shutil.which("node")
    if node is None:
        pytest.skip("node not available")
    result = subprocess.run(
        [node, "-e", source, *(str(arg) for arg in args)],
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr or result.stdout


def test_v2_candidate_remaining_counts_and_interpolation() -> None:
    """Every v2 objective retains an exact current point plus future samples.

    Offsets are relative to the v2 replay start.  The expected values are the
    fixed acceptance row from the repair plan; they deliberately distinguish
    ``>= now`` filtering from the required interpolated first point.
    """

    bundle = _v2_bundle()
    source = r'''
const fs = require("fs");
const vm = require("vm");
const {webcrypto} = require("crypto");
const context = {window: {crypto: webcrypto}, TextEncoder};
vm.runInNewContext(fs.readFileSync(process.argv[1], "utf8"), context,
  {filename: process.argv[1]});
vm.runInNewContext(fs.readFileSync(process.argv[2], "utf8"), context,
  {filename: process.argv[2]});
const motion = context.window.ArcticRouteMotion;
const visual = context.window.ArcticRouteVisualSmoothing;
const bundle = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
const startMs = Date.parse(bundle.replay.start);
const runtime = bundle.runtime_route_candidate_sets?.[0]?.runtime_route_candidates;
if (!runtime) throw new Error("v2 runtime candidate package is missing");

// Keep this list intentionally short: it allows the implementation to call
// the operation clipPathAtTime, clipFuturePath, clipRemainingPath, or
// clipCandidatePath without coupling the regression to one spelling.
const clip = visual.clipTimedPath;
if (!clip) throw new Error(
  "ArcticRouteVisualSmoothing must expose a public temporal clip operation");

const expectedCounts = {
  "18:37:42": {fastest: 15, low_risk: 15, recommended: 15},
  "24:28:57": {fastest: 13, low_risk: 13, recommended: 13},
  "26:35:32": {fastest: 12, low_risk: 12, recommended: 12},
  "35:16:33": {fastest: 8, low_risk: 9, recommended: 9},
};
const offsets = Object.keys(expectedCounts).map((clock) => {
  const [hours, minutes, seconds] = clock.split(":").map(Number);
  return [clock, (hours * 3600 + minutes * 60 + seconds) * 1000];
});
const coordinate = (point) => ({
  lon: Number(point?.lon ?? point?.longitude),
  lat: Number(point?.lat ?? point?.latitude),
});
const pointList = (value) => Array.isArray(value) ? value :
  value?.points || value?.remaining_points || value?.remainingPoints ||
  value?.path || value?.visible_points || [];
const countOf = (value, points) => Number(
  value?.remaining_point_count ?? value?.remainingPointCount ??
  value?.point_count ?? value?.pointCount ?? points.length
);
const hiddenOf = (value) => Boolean(value?.hidden || value?.visible === false ||
  value?.hidden_reason || value?.hiddenReason);
const reasonOf = (value) => value?.hidden_reason ?? value?.hiddenReason ??
  value?.reason ?? null;
const invoke = (path, nowMs, identity) => {
  return clip(path.points, startMs + nowMs, {
    source: path.source,
    identity,
    expectedIdentity: identity,
  });
};
const linearAt = (samples, nowMs) => {
  const target = startMs + nowMs;
  let index = 0;
  while (index < samples.length - 1 && samples[index + 1].eta < target) index++;
  const left = samples[index];
  const right = samples[Math.min(index + 1, samples.length - 1)];
  const span = right.eta - left.eta;
  const fraction = span > 0 ? (target - left.eta) / span : 0;
  return {
    lon: left.lon + (right.lon - left.lon) * fraction,
    lat: left.lat + (right.lat - left.lat) * fraction,
  };
};

for (const candidate of runtime.candidates.filter((item) =>
  item.layer === "full_voyage")) {
  const identity = {
    revision: 1,
    layer_set_id: runtime.layer_set_id,
    candidate_id: candidate.candidate_id,
    objective: candidate.objective,
  };
  const path = motion.buildCandidatePath(bundle, candidate, startMs,
    runtime.layer_set_id);
  if (!path) throw new Error(`cannot build ${candidate.objective} candidate path`);
  const samples = path.timesMs.map((time, index) => ({
    ...coordinate(path.points[index]), eta: startMs + time,
  }));
  for (const [clock, nowMs] of offsets) {
    const result = invoke(path, nowMs, identity);
    const points = pointList(result);
    if (hiddenOf(result)) throw new Error(
      `${candidate.objective} unexpectedly hidden at ${clock}`);
    if (countOf(result, points) !== expectedCounts[clock][candidate.objective]) {
      throw new Error(`${candidate.objective} at ${clock}: expected ` +
        `${expectedCounts[clock][candidate.objective]} points, got ` +
        `${countOf(result, points)}`);
    }
    if (points.length < 2) throw new Error(`${candidate.objective} at ${clock} too short`);
    const first = coordinate(points[0]);
    const expected = linearAt(samples, nowMs);
    if (Math.abs(first.lon - expected.lon) > 1e-8 ||
        Math.abs(first.lat - expected.lat) > 1e-8) {
      throw new Error(`${candidate.objective} at ${clock} lacks exact interpolated start`);
    }
    const firstEta = Date.parse(points[0].eta ?? result?.first_visible_eta ?? "");
    if (Number.isFinite(firstEta) && Math.abs(firstEta - (startMs + nowMs)) > 1) {
      throw new Error(`${candidate.objective} at ${clock} first ETA is not simulation time`);
    }
  }

  const afterArrival = invoke(path, Date.parse(candidate.arrival_eta) - startMs + 1,
    identity);
  if (!hiddenOf(afterArrival) || !reasonOf(afterArrival)) {
    throw new Error(`${candidate.objective} must hide after arrival with a reason`);
  }

  for (const [label, mutation] of [
    ["revision", {...identity, revision: 2}],
    ["layer_set", {...identity, layer_set_id: "layer-set-sha256-" + "0".repeat(64)}],
    ["candidate", {...identity, candidate_id: "route-v3-sha256-" + "0".repeat(64)}],
    ["objective", {...identity,
      objective: identity.objective === "low_risk" ? "fastest" : "low_risk"}],
  ]) {
    const invalid = clip(path.points, startMs + offsets[0][1], {
      source: path.source,
      identity: mutation,
      expectedIdentity: identity,
    });
    if (!hiddenOf(invalid) || !reasonOf(invalid)) {
      throw new Error(`identity mismatch (${label}) was not fail-closed`);
    }
  }
}
'''
    _run_node(source, VIEWER / "route_motion.js", VIEWER / "route_visual_smoothing.js", bundle)


def test_candidate_clip_and_debug_contract_are_exposed_without_changing_formal_state() -> None:
    """Lock the integration seam while leaving the formal state contract intact."""

    app = (VIEWER / "app.js").read_text(encoding="utf-8")
    visual = (VIEWER / "route_visual_smoothing.js").read_text(encoding="utf-8")

    # The implementation may choose the concrete helper name, but it must be
    # a public reader operation and must carry the identity tuple through the
    # clip/diagnostic path.
    assert "clipTimedPath" in visual
    assert any(
        token in app for token in ("candidateTimedPath", "candidateRemaining", "clipCandidate")
    )
    for token in ("active_revision", "layer_set_id", "candidate_id", "objective"):
        assert token in app
    for token in (
        "hidden_reason",
        "first_visible_eta",
        "remaining_point_count",
        "candidate_clip_source",
    ):
        assert token in app or token in visual
    for reason in (
        "candidate_set_digest_identity_mismatch",
        "runtime_candidate_set_digest_identity_mismatch",
        "candidate_eta_identity_mismatch",
        "candidate_metadata_identity_mismatch",
    ):
        assert reason in app
    assert "samePublishedValue" in app
    assert "candidatePackageForRevision(revision)" in app

    # Presentation defaults are synchronized after preflight; malformed
    # candidate data must retain the ordinary navigation simulation fallback.
    assert "SINGLE_ROUTE_FALLBACK" in app
    assert "candidateInspection?.valid" in app
    assert "viewMode = \"research\"" in app
    assert "viewMode = \"presentation\"" in app
    assert "研究验证" in app and "航行仿真" in app

    # Runtime locking is a display/selection state.  Formal timeline state,
    # ETA and risk remain producer-owned and are not rewritten by the lock.
    assert "runtime_route_locked" in app
    assert "runtime_candidate_selection_locked" in app
    assert "riskSelection" in app
    assert "active_revision" in app
    assert "arrival_eta" in app


def test_debug_diagnostics_keep_display_and_authoritative_geometry_distinct() -> None:
    app = (VIEWER / "app.js").read_text(encoding="utf-8")
    # Candidate diagnostics are presentation-only; completed track and
    # formal motion must retain their separate producer paths.
    assert "candidateVisualDiagnostics" in app
    assert "presentation_only: true" in app
    assert "authoritative_semantics_unchanged" in app
    assert "routeMotion()" in app or "routeMotion:" in app
    assert "stateAt()" in app
    assert "candidateOverlayReplacesRoute" in app
