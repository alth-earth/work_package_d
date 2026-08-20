"""Viewer bundle contract tests run against a locally exported package.

The bundle is produced by the orchestrator Presentation Adapter and is
gitignored in work_package_d, so these tests are real-artifact smoke tests:
they skip cleanly when the artifact is not present.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import pytest

VIEWER_DIR = Path(__file__).resolve().parents[2] / "viewer"


def _haversine_km(a: dict, b: dict) -> float:
    lat1 = math.radians(a["lat"])
    lat2 = math.radians(b["lat"])
    delta_lat = lat2 - lat1
    delta_lon = math.radians(b["lon"] - a["lon"])
    h = (
        math.sin(delta_lat / 2.0) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin(delta_lon / 2.0) ** 2
    )
    return 2.0 * 6371.0088 * math.asin(min(1.0, math.sqrt(h)))


@pytest.fixture(scope="module")
def bundle() -> dict:
    path = VIEWER_DIR / "bundle.json"
    if not path.exists():
        pytest.skip("bundle.json not present; run orchestrator replay_viewer_export first")
    return json.loads(path.read_text(encoding="utf-8"))


def test_bundle_gates_and_basemap(bundle: dict) -> None:
    assert bundle["gates"]["status"] == "PASS"
    assert bundle["gates"]["l2_status"] == "PASS"
    assert bundle["basemap"]["projection"] == "EPSG:4326"
    assert bundle["replay"]["manifest_semantic_digest"].startswith("1bdcbce5")
    assert bundle["presentation"]["schema_version"] == "presentation.viewer-presentation.v1"
    assert bundle["presentation"]["risk_rendering"]["geometry_policy"] == (
        "exact_authoritative_cells_no_interpolation"
    )
    assert bundle["presentation"]["route_rendering"]["authoritative_semantics_unchanged"]


def test_bundle_intermediate_ship_positions_change(bundle: dict) -> None:
    a = bundle["acceptance_positions"]["10:00"]
    b = bundle["acceptance_positions"]["10:30"]
    c = bundle["acceptance_positions"]["11:00"]
    assert a["status"] == "UNDERWAY" == b["status"] == c["status"]
    assert a["latitude"] < b["latitude"] < c["latitude"]
    assert 0.1 < _haversine_km(
        {"lon": a["longitude"], "lat": a["latitude"]},
        {"lon": b["longitude"], "lat": b["latitude"]},
    ) < 12


def test_timeline_moves_and_track_never_rewinds(bundle: dict) -> None:
    timeline = bundle["timeline"]
    assert len(timeline) == 721
    assert timeline[0]["t"] == bundle["replay"]["start"]
    assert timeline[-1]["t"] == bundle["replay"]["end"]
    previous_length = 0
    previous_pos = None
    max_delta = 0.0
    for entry in timeline:
        assert entry["ctl"] >= previous_length
        previous_length = entry["ctl"]
        pos = {"lon": entry["v"]["lon"], "lat": entry["v"]["lat"]}
        if previous_pos:
            max_delta = max(max_delta, _haversine_km(previous_pos, pos))
        previous_pos = pos
    assert max_delta < 2.0


def test_deferred_revision_visible_in_timeline(bundle: dict) -> None:
    timeline = bundle["timeline"]
    decided_at_1300 = next(
        entry for entry in timeline if entry["t"] >= "2026-08-15T13:00:00Z"
    )
    pending_at_1330 = next(
        entry for entry in timeline if entry["t"] >= "2026-08-15T13:30:00Z"
    )
    adopted_at_1500 = next(
        entry for entry in timeline if entry["t"] >= "2026-08-15T15:00:00Z"
    )
    assert pending_at_1330["arv"] == 1
    assert pending_at_1330["prv"] == 2
    assert pending_at_1330["prs"] == "PENDING"
    assert decided_at_1300["pending"]["revision"] == 2
    assert adopted_at_1500["arv"] == 2


def test_replan_skipped_does_not_change_active_revision(bundle: dict) -> None:
    timeline = bundle["timeline"]
    at_1100 = next(
        entry for entry in timeline if entry["t"] >= "2026-08-15T11:00:00Z"
    )
    assert at_1100["arv"] == 1
    skipped = [e for e in bundle["events"] if e["type"] == "REPLAN_SKIPPED"]
    assert len(skipped) == 1


def test_bundle_projects_current_risk_frames_without_recomputing_them(bundle: dict) -> None:
    risk = bundle["risk"]
    assert risk["status"] == "PASS"
    assert risk["selection_rule"] == "latest_valid_time_at_or_before_simulation_time"
    assert risk["cadence_seconds"] == 3600
    assert risk["level_range"] == [1, 5]
    assert risk["source"]["schema_version"] == "bc.risk-frame.v2"
    assert risk["source"]["provenance"] == ["formal"]
    assert len(risk["frames"]) == 13
    assert [frame["valid_time"] for frame in risk["frames"]] == [
        f"2026-08-15T{hour:02d}:00:00Z" for hour in range(10, 23)
    ]
    hard_reasons = {
        reason
        for frame in risk["frames"]
        for reason in frame["hard_reasons"]
    }
    assert {"NONE", "LAND", "DATA_UNAVAILABLE"} <= hard_reasons
    assert any(
        reason == "DATA_UNAVAILABLE"
        for frame in risk["frames"]
        for reason in frame["hard_reasons"]
    )


def test_risk_horizon_selection_is_explicit_and_fail_closed(bundle: dict) -> None:
    risk = bundle["risk"]
    assert risk["supported_horizons_hours"] == [0, 6, 12, 24]
    assert risk["horizon_selection_rules"]["current"] == (
        "latest_valid_time_at_or_before_simulation_time"
    )
    assert risk["horizon_selection_rules"]["future"] == (
        "floor_valid_time_at_or_before_requested_valid_time"
    )

    at_1000 = next(
        item for item in risk["horizon_selections"]
        if item["simulation_time"] == "2026-08-15T10:00:00Z"
    )
    at_1030 = next(
        item for item in risk["horizon_selections"]
        if item["simulation_time"] == "2026-08-15T10:30:00Z"
    )
    assert at_1000["available_horizons"] == ["current", "+6h", "+12h"]
    assert at_1000["selections"]["+6h"]["selection_method"] == (
        "exact_requested_valid_time"
    )
    assert at_1030["selections"]["+6h"]["actual_valid_time"] == "2026-08-15T16:00:00Z"
    assert at_1030["selections"]["+6h"]["actual_horizon_seconds"] == 19800
    assert at_1030["selections"]["+12h"]["availability"] == "UNAVAILABLE"
    assert at_1030["selections"]["+12h"]["actual_valid_time"] is None
    assert at_1030["selections"]["+12h"]["frame_index"] is None


def test_pending_and_superseded_routes_are_temporally_distinct(bundle: dict) -> None:
    timeline = bundle["timeline"]
    pending_at_1330 = max(
        entry
        for entry in timeline
        if entry["t"] <= "2026-08-15T13:30:00Z" and "pending" in entry
    )
    at_1500 = next(entry for entry in timeline if entry["t"] >= "2026-08-15T15:00:00Z")
    assert pending_at_1330["arv"] == 1
    assert pending_at_1330["pending"]["revision"] == 2
    assert "superseded" not in pending_at_1330 or pending_at_1330["superseded"] is None
    assert at_1500["arv"] == 2
    assert at_1500["superseded"]


def test_completed_track_prefix_is_append_only(bundle: dict) -> None:
    previous: list[dict] = []
    for entry in bundle["timeline"]:
        track = entry.get("track")
        if track is None:
            continue
        assert track[: len(previous)] == previous
        previous = track
