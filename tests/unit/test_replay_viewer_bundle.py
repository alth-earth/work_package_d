"""Viewer bundle contract tests run against a locally exported package.

The bundle is produced by the orchestrator Presentation Adapter and is
gitignored in work_package_d, so these tests are real-artifact smoke tests:
they skip cleanly when the artifact is not present.
"""

from __future__ import annotations

import json
import math
from datetime import datetime, timedelta
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


def _is_causal_replay(bundle: dict) -> bool:
    return bundle["replay"].get("scenario_mode") == "causal_replay"


def _is_dynamic_replay(bundle: dict) -> bool:
    return (
        bundle.get("combined_presentation", {}).get("replanning_status")
        == "PUBLISHED_RETROSPECTIVE_DYNAMIC_REPLAY"
    )


def _start(bundle: dict) -> datetime:
    return datetime.fromisoformat(bundle["replay"]["start"].replace("Z", "+00:00"))


def _at_or_after(bundle: dict, offset_hours: float) -> dict:
    target = _start(bundle) + timedelta(hours=offset_hours)
    return next(
        entry
        for entry in bundle["timeline"]
        if datetime.fromisoformat(entry["t"].replace("Z", "+00:00")) >= target
    )


def _latest_field_at_or_before(bundle: dict, entry: dict, field: str):
    found = None
    for item in bundle["timeline"]:
        if item["t"] > entry["t"]:
            break
        if field in item:
            found = item[field]
    return found


def test_bundle_gates_and_basemap(bundle: dict) -> None:
    assert bundle["gates"]["status"] == "PASS"
    assert bundle["gates"]["l2_status"] == "PASS"
    assert bundle["basemap"]["projection"] == "EPSG:4326"
    assert len(bundle["replay"]["manifest_semantic_digest"]) == 64
    assert bundle["presentation"]["schema_version"] == "presentation.viewer-presentation.v1"
    assert bundle["presentation"]["risk_rendering"]["geometry_policy"] == (
        "exact_authoritative_cells_no_interpolation"
    )
    assert bundle["presentation"]["route_rendering"]["authoritative_semantics_unchanged"]
    assert bundle["route_candidates"]["schema_version"] == "presentation.route-candidates.v1"
    if bundle["replay"].get("identity_kind") == "combined_presentation_assembly":
        assert bundle["route_candidates"]["status"] == "PUBLISHED"
        assert len(bundle["route_candidates"]["candidates"]) == 12
        formal_inspection = bundle["formal_motion_inspection"]
        assert formal_inspection["valid"] is True
        assert formal_inspection["schema_version"] == "cd.route-motion-set.v1"
        assert formal_inspection["set_count"] == len(bundle["route_motion_sets"])
        assert formal_inspection["record_count"] == 4 * formal_inspection["set_count"]
        assert formal_inspection["record_layers"] == [
            "full_voyage",
            "main_corridor_24_72h",
            "rolling_0_24h",
            "executable_0_6h",
        ]
        combined = bundle["combined_presentation"]
        assert combined["status"] == "PUBLISHED"
        assert combined["candidate_set_id"] == bundle["route_candidates"]["candidate_set_id"]
        assert combined["selected_candidate_id"] == bundle["route_candidates"][
            "selected_candidate_id"
        ]
        candidate_sets = bundle.get("route_candidate_sets", [])
        assert candidate_sets
        assert len(candidate_sets) == len(
            combined["route_candidate_set_bindings"]
        )
        assert all(
            len(item["route_candidates"]["candidates"]) == 12
            for item in candidate_sets
        )
    else:
        assert bundle["route_candidates"]["status"] == "NOT_PUBLISHED"
        assert bundle["route_candidates"]["candidates"] == []


def test_bundle_intermediate_ship_positions_change(bundle: dict) -> None:
    positions = list(bundle["acceptance_positions"].values())
    assert len(positions) >= 3
    a, b, c = positions[:3]
    assert a["status"] == "UNDERWAY" == b["status"] == c["status"]
    assert a["latitude"] < b["latitude"] < c["latitude"]
    assert 0.1 < _haversine_km(
        {"lon": a["longitude"], "lat": a["latitude"]},
        {"lon": b["longitude"], "lat": b["latitude"]},
    ) < 12


def test_timeline_moves_and_track_never_rewinds(bundle: dict) -> None:
    timeline = bundle["timeline"]
    assert timeline[0]["t"] == bundle["replay"]["start"]
    assert timeline[-1]["t"] == bundle["replay"]["end"]
    start = datetime.fromisoformat(bundle["replay"]["start"].replace("Z", "+00:00"))
    end = datetime.fromisoformat(bundle["replay"]["end"].replace("Z", "+00:00"))
    expected_samples = math.ceil((end - start).total_seconds() / 60) + 1
    assert len(timeline) == expected_samples
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
    if not (_is_causal_replay(bundle) or _is_dynamic_replay(bundle)):
        pytest.skip("Winter combined navigation simulation has no replay replanning events")
    timeline = bundle["timeline"]
    if _is_dynamic_replay(bundle):
        decided_at_1300 = _at_or_after(bundle, 6)
        pending_at_1330 = _at_or_after(bundle, 6.5)
        adopted_at_1500 = _at_or_after(bundle, 12)
    else:
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
    if not _is_causal_replay(bundle):
        assert _is_dynamic_replay(bundle)
        assert any(event["type"] == "REPLAN_ADOPTED" for event in bundle["events"])
        return
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
    assert risk["frames"][0]["valid_time"] == bundle["replay"]["start"]
    assert risk["frames"][-1]["valid_time"] >= bundle["replay"]["end"]
    if _is_causal_replay(bundle):
        assert risk["frames"][-1]["valid_time"] == bundle["replay"]["end"]
    else:
        assert risk["source"]["scenario_id"] == bundle["replay"]["scenario_id"]
        assert risk["source"]["risk_window_id"] == bundle["combined_presentation"][
            "risk_window_id"
        ]
        assert len(risk["frames"]) == bundle["research_validation"]["risk_frame_count"]
    hard_reasons = {
        reason
        for frame in risk["frames"]
        for reason in frame["hard_reasons"]
    }
    if any(frame.get("hard_reason_source") == "payload.hard_reason" for frame in risk["frames"]):
        assert {"NONE", "LAND", "DATA_UNAVAILABLE"} <= hard_reasons
        assert any(
            reason == "DATA_UNAVAILABLE"
            for frame in risk["frames"]
            for reason in frame["hard_reasons"]
        )
    else:
        assert "NONE" in hard_reasons
        assert "HARD_MASK_REASON_UNAVAILABLE" in hard_reasons
        assert all(
            frame.get("hard_reason_source")
            == "producer_hard_mask_only_reason_unavailable"
            for frame in risk["frames"]
        )


def test_bundle_exposes_presentation_risk_distribution_summary(bundle: dict) -> None:
    risk = bundle["risk"]
    assert risk["grid"] == {
        "rows": 31,
        "cols": 11,
        "latitude_resolution_degrees": pytest.approx(0.3666666667),
        "longitude_resolution_degrees": pytest.approx(1.2),
    }
    first = risk["frames"][0]["summary"]
    assert first["total_cells"] == 341
    assert sum(first["risk_level_counts"].values()) == first["total_cells"]
    assert sum(first["hard_reason_counts"].values()) == first["total_cells"]
    if first.get("hard_reason_counts", {}).get("HARD_MASK_REASON_UNAVAILABLE", 0):
        assert first["hard_cell_count"] == first["hard_reason_counts"][
            "HARD_MASK_REASON_UNAVAILABLE"
        ]
    else:
        assert first["data_unavailable_count"] > 0
        assert first["hard_cell_count"] == (
            first["land_count"] + first["data_unavailable_count"]
        )
    assert risk["forecast_summary"]["trend"] in {"decreasing", "stable", "increasing"}


def test_route_decision_metadata_exposes_authoritative_eta_and_metrics(bundle: dict) -> None:
    initial = bundle["routes"][0]
    assert initial["objective"] == "recommended"
    assert initial["arrival_eta"] == initial["waypoints"][-1]["eta"]
    assert initial["metrics"]["distance_km"] == initial["distance_km"]
    if bundle["route_candidates"]["status"] == "PUBLISHED":
        selected = next(
            candidate
            for candidate in bundle["route_candidates"]["candidates"]
            if candidate["candidate_id"] == bundle["route_candidates"]["selected_candidate_id"]
        )
        assert initial["route_id"] == selected["candidate_id"]
        assert initial["metrics"]["average_risk"] == selected["risk_metrics"]["average_risk"]
        assert initial["metrics"]["maximum_risk"] == selected["risk_metrics"]["maximum_risk"]
    else:
        assert initial["metrics"]["average_risk"] is None
        assert initial["metrics"]["maximum_risk"] is None


def test_risk_horizon_selection_is_explicit_and_fail_closed(bundle: dict) -> None:
    risk = bundle["risk"]
    assert risk["supported_horizons_hours"] == [0, 6, 12, 24]
    assert risk["horizon_selection_rules"]["current"] == (
        "latest_valid_time_at_or_before_simulation_time"
    )
    assert risk["horizon_selection_rules"]["future"] == (
        "floor_valid_time_at_or_before_requested_valid_time"
    )

    at_start = risk["horizon_selections"][0]
    at_30m = risk["horizon_selections"][30]
    assert at_start["simulation_time"] == bundle["replay"]["start"]
    assert at_start["available_horizons"] == [
        horizon
        for horizon in ("current", "+6h", "+12h", "+24h")
        if at_start["selections"][horizon]["availability"] == "AVAILABLE"
    ]
    assert at_start["selections"]["+6h"]["selection_method"] == (
        "exact_requested_valid_time"
    )
    expected_floor = datetime.fromisoformat(
        at_30m["simulation_time"].replace("Z", "+00:00")
    ).replace(minute=0)
    actual = datetime.fromisoformat(
        at_30m["selections"]["+6h"]["actual_valid_time"].replace("Z", "+00:00")
    )
    assert actual == expected_floor + timedelta(hours=6)
    for item in risk["horizon_selections"]:
        for selection in item["selections"].values():
            if selection["availability"] == "UNAVAILABLE":
                assert selection["actual_valid_time"] is None
                assert selection["frame_index"] is None


def test_pending_and_superseded_routes_are_temporally_distinct(bundle: dict) -> None:
    if not (_is_causal_replay(bundle) or _is_dynamic_replay(bundle)):
        pytest.skip("Winter combined navigation simulation publishes one initial route revision")
    timeline = bundle["timeline"]
    if _is_dynamic_replay(bundle):
        pending_at_1330 = max(
            (
                entry
                for entry in timeline
                if entry.get("pending")
                and datetime.fromisoformat(entry["t"].replace("Z", "+00:00"))
                <= _start(bundle) + timedelta(hours=6.5)
            ),
            key=lambda entry: entry["t"],
        )
        at_1500 = _at_or_after(bundle, 12)
    else:
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
    assert _latest_field_at_or_before(bundle, at_1500, "superseded")


def test_completed_track_prefix_is_append_only(bundle: dict) -> None:
    previous: list[dict] = []
    for entry in bundle["timeline"]:
        track = entry.get("track")
        if track is None:
            continue
        assert track[: len(previous)] == previous
        previous = track


def test_dynamic_publication_ends_at_real_arrival_without_eta_projection(bundle: dict) -> None:
    if not _is_dynamic_replay(bundle):
        return
    source = bundle["combined_presentation"]["source_replay"]
    assert "timeline_projection" not in source
    assert bundle["timeline"][-1]["v"]["status"] == "ARRIVED"
    assert bundle["timeline"][-1].get("prv") is None
    assert bundle["timeline"][-1].get("seg") is None
    covered = {
        record["plan_id"]
        for motion_set in bundle["route_motion_sets"]
        for record in motion_set["records"]
        if record["planning_layer"] == "full_voyage"
    }
    assert {
        route["route_id"]
        for route in bundle["routes"]
        if route["effective_adoption_time"] is not None
    } <= covered


def test_winter_combined_bundle_keeps_one_experiment_identity(bundle: dict) -> None:
    combined = bundle.get("combined_presentation")
    if not combined:
        pytest.skip("current local Viewer artifact is the legacy replay package")

    assert combined["schema_version"] == "presentation.winter-combined-viewer.v1"
    assert combined["status"] == "PUBLISHED"
    assert combined["scenario_label"] == "Winter Arctic Research"
    assert combined["dataset_bundle_id"] == bundle["risk"]["source"]["dataset_bundle_id"]
    assert combined["run_context_id"] == bundle["risk"]["source"]["run_id"]
    assert combined["risk_window_id"] == bundle["risk"]["source"]["risk_window_id"]
    if _is_dynamic_replay(bundle):
        assert combined["source_replay"]["scenario_mode"] == (
            "retrospective_dynamic_replay"
        )
        assert combined["timeline_source"] == (
            "orchestrator.presentation_adapter.retrospective_dynamic_replay"
        )
    else:
        assert combined["source_replay"] is None
        assert combined["timeline_source"] == "cd.route-plan.v3.waypoints.eta"
    assert bundle["risk"]["source"]["run_id"] == combined["run_context_id"]
    assert bundle["risk"]["source"]["dataset_bundle_id"] == combined["dataset_bundle_id"]
    assert bundle["risk"]["source"]["risk_window_id"] == combined["risk_window_id"]
    assert bundle["route_candidates"]["provenance"]["source_run_id"] == combined[
        "run_context_id"
    ]
    assert {
        candidate["provenance"]["scenario_id"]
        for candidate in bundle["route_candidates"]["candidates"]
    } == {bundle["replay"]["scenario_id"]}


def test_default_winter_bundle_does_not_fabricate_replan_events(bundle: dict) -> None:
    if _is_causal_replay(bundle) or _is_dynamic_replay(bundle):
        assert any(event["type"] == "REPLAN_DECIDED" for event in bundle["events"])
        assert any(event["type"] == "REPLAN_ADOPTED" for event in bundle["events"])
        return
    combined = bundle["combined_presentation"]
    assert combined["replanning_status"] == (
        "UNAVAILABLE_IDENTITY_BOUND_CAUSAL_REPLAY_REQUIRED"
    )
    assert bundle["events"] == []
