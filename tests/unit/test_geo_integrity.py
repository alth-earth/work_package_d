"""Route Geospatial Integrity gate tests (synthetic + real frozen artifacts)."""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from arctic_route_display.demo.frozen_loader import FrozenScenarioSource, load_frozen_scenario
from arctic_route_display.demo.geo_integrity import (
    DIAGONAL_CORNER_CUT,
    EDGE_DATA_UNAVAILABLE,
    EDGE_LAND_INTERSECTION,
    ROUTE_REPRESENTATION_MISMATCH,
    TEMPORAL_FRAME_MISMATCH,
    WAYPOINT_DATA_UNAVAILABLE,
    WAYPOINT_ON_LAND,
    _haversine_km,
    audit_route,
    run_geo_integrity_audit,
    viewer_pixel_intersections,
)


def _workspace_root() -> Path:
    env = os.environ.get("ARCTIC_ROUTE_ROOT")
    if env and Path(env).is_dir():
        return Path(env)
    for parent in Path(__file__).resolve().parents:
        if (parent / "arctic_route_contracts").is_dir():
            return parent
    return Path.home()


CONFIG = _workspace_root() / "work_package_d" / "configs" / "demo_frozen_sources.json"
_SMOKE = _workspace_root() / "work_package_a" / "data" / "output" / "rc2-smoke"
MUR_OUT = _SMOKE / "output-mur-opt"
TROMSO_OUT = _SMOKE / "output-tromso-144h-r2"


def _frame(
    hard: list[list[bool]],
    reasons: list[list[str]],
    *,
    valid_time: str,
    latitudes: tuple[float, ...] = (50.0, 51.0, 52.0),
    longitudes: tuple[float, ...] = (10.0, 11.0, 12.0),
) -> dict:
    return {
        "risk_id": f"risk-{valid_time}",
        "valid_time": valid_time,
        "payload": {
            "coordinates": {
                "latitude": list(latitudes),
                "longitude": list(longitudes),
            },
            "variables": {
                "hard_mask": hard,
                "hard_reason": reasons,
                "risk_score": [[0.1] * 3 for _ in range(3)],
                "risk_level": [[1] * 3 for _ in range(3)],
                "confidence": [[1.0] * 3 for _ in range(3)],
            },
        },
    }


def _none_frame(valid_time: str) -> dict:
    hard = [[False] * 3 for _ in range(3)]
    reasons = [["NONE"] * 3 for _ in range(3)]
    return _frame(hard, reasons, valid_time=valid_time)


def _coords() -> dict:
    return {"latitude": (50.0, 51.0, 52.0), "longitude": (10.0, 11.0, 12.0)}


def _waypoints(points: list[tuple[float, float]], start_hour: int = 6) -> list[dict]:
    waypoints = []
    for index, (longitude, latitude) in enumerate(points):
        waypoints.append(
            {
                "longitude": longitude,
                "latitude": latitude,
                "eta": f"2026-08-11T{start_hour + index:02d}:00:00Z",
                "recommended_speed_mps": 5.0,
            }
        )
    return waypoints


def _metrics(waypoints: list[dict]) -> dict:
    distance = sum(
        _haversine_km(
            float(waypoints[index]["longitude"]),
            float(waypoints[index]["latitude"]),
            float(waypoints[index + 1]["longitude"]),
            float(waypoints[index + 1]["latitude"]),
        )
        for index in range(len(waypoints) - 1)
    )
    return {
        "distance_km": distance,
        "eta_hours": float(len(waypoints) - 1),
        "hard_constraint_violations": 0,
        "expanded_nodes": 1,
    }


def _audit(
    frames: tuple[dict, ...],
    coords: dict,
    waypoints: list[dict],
    metrics: dict,
) -> object:
    return audit_route(
        scenario_id="synthetic",
        phase="initial",
        planning_layer="full_voyage",
        objective="fastest",
        route_id="route-synthetic",
        waypoints=tuple(waypoints),
        metrics=metrics,
        frames=frames,
        coords=coords,
    )


def test_pass_route_has_no_violations() -> None:
    frames = (
        _none_frame("2026-08-11T06:00:00Z"),
        _none_frame("2026-08-11T07:00:00Z"),
        _none_frame("2026-08-11T08:00:00Z"),
    )
    result = _audit(
        frames,
        _coords(),
        _waypoints([(10.0, 50.0), (11.0, 51.0), (12.0, 52.0)]),
        _metrics(_waypoints([(10.0, 50.0), (11.0, 51.0), (12.0, 52.0)])),
    )
    assert result.status == "PASS"
    assert result.waypoint_hard_violations == 0
    assert result.edge_hard_violations == 0
    assert result.corner_cutting_violations == 0


def test_waypoint_on_land_detected() -> None:
    hard = [[False] * 3 for _ in range(3)]
    reasons = [["NONE"] * 3 for _ in range(3)]
    hard[1][1] = True
    reasons[1][1] = "LAND"
    frames = (
        _frame(hard, reasons, valid_time="2026-08-11T06:00:00Z"),
        _frame(hard, reasons, valid_time="2026-08-11T07:00:00Z"),
    )
    waypoints = _waypoints([(10.0, 50.0), (11.0, 51.0)])
    result = _audit(frames, _coords(), waypoints, _metrics(waypoints))
    assert result.status == "FAIL"
    assert result.waypoint_hard_violations >= 1
    assert any(v.violation_type == WAYPOINT_ON_LAND for v in result.violations)
    assert result.land_intersections >= 1


def test_diagonal_corner_cut_detected() -> None:
    hard = [[False] * 3 for _ in range(3)]
    reasons = [["NONE"] * 3 for _ in range(3)]
    hard[0][1] = True
    reasons[0][1] = "LAND"
    frames = (
        _frame(hard, reasons, valid_time="2026-08-11T06:00:00Z"),
        _frame(hard, reasons, valid_time="2026-08-11T07:00:00Z"),
    )
    waypoints = _waypoints([(10.0, 50.0), (11.0, 51.0)])
    result = _audit(frames, _coords(), waypoints, _metrics(waypoints))
    assert result.corner_cutting_violations >= 1
    assert any(v.violation_type == DIAGONAL_CORNER_CUT for v in result.violations)
    assert any(v.violation_type == EDGE_LAND_INTERSECTION for v in result.violations)


def test_edge_data_unavailable_detected() -> None:
    hard = [[False] * 3 for _ in range(3)]
    reasons = [["NONE"] * 3 for _ in range(3)]
    hard[1][0] = True
    reasons[1][0] = "DATA_UNAVAILABLE"
    frames = (
        _frame(hard, reasons, valid_time="2026-08-11T06:00:00Z"),
        _frame(hard, reasons, valid_time="2026-08-11T07:00:00Z"),
    )
    waypoints = _waypoints([(10.0, 50.0), (10.0, 51.0)])
    result = _audit(frames, _coords(), waypoints, _metrics(waypoints))
    assert result.data_unavailable_violations >= 1
    assert any(
        v.violation_type in (EDGE_DATA_UNAVAILABLE, WAYPOINT_DATA_UNAVAILABLE)
        for v in result.violations
    )


def test_temporal_out_of_window_detected() -> None:
    frame = _none_frame("2026-08-11T06:00:00Z")
    waypoints = [
        {
            "longitude": 10.0,
            "latitude": 50.0,
            "eta": "2026-08-11T06:00:00Z",
            "recommended_speed_mps": 5.0,
        },
        {
            "longitude": 11.0,
            "latitude": 51.0,
            "eta": "2026-08-12T00:00:00Z",
            "recommended_speed_mps": 5.0,
        },
    ]
    result = _audit((frame,), _coords(), waypoints, _metrics(waypoints))
    assert result.temporal_mapping_status == "FAIL"
    assert any(v.violation_type == TEMPORAL_FRAME_MISMATCH for v in result.violations)


def test_non_grid_waypoint_detected() -> None:
    frame = _none_frame("2026-08-11T06:00:00Z")
    waypoints = [
        {
            "longitude": 10.37,
            "latitude": 50.0,
            "eta": "2026-08-11T06:00:00Z",
            "recommended_speed_mps": 5.0,
        }
    ]
    metrics = {"distance_km": 0.0, "eta_hours": 0.0}
    result = _audit((frame,), _coords(), waypoints, metrics)
    assert result.representation_status == "FAIL"
    assert any(
        v.violation_type == ROUTE_REPRESENTATION_MISMATCH for v in result.violations
    )


def _viewer_scenario(land_cell: tuple[int, int]) -> dict:
    """Non-square synthetic scenario that the historical mixed projection
    misaligned (wide lon span vs narrow lat span)."""

    latitudes = (50.0, 51.0, 52.0)
    longitudes = (0.0, 10.0, 20.0)
    hard = [[False] * 3 for _ in range(3)]
    reasons = [["NONE"] * 3 for _ in range(3)]
    hard[land_cell[0]][land_cell[1]] = True
    reasons[land_cell[0]][land_cell[1]] = "LAND"
    flat_lon = [lon for _ in range(3) for lon in longitudes]
    flat_lat = [lat for lat in latitudes for _ in range(3)]
    flat_hard = [hard[r][c] for r in range(3) for c in range(3)]
    flat_reasons = [reasons[r][c] for r in range(3) for c in range(3)]
    waypoints = [
        {"longitude": 0.0, "latitude": 50.0, "eta": "2026-08-11T06:00:00Z"},
        {"longitude": 20.0, "latitude": 50.0, "eta": "2026-08-11T08:00:00Z"},
    ]
    return {
        "phases": [
            {
                "phase": "initial",
                "routes": [
                    {
                        "planning_layer": "full_voyage",
                        "objective": "fastest",
                        "waypoints": waypoints,
                    }
                ],
            }
        ],
        "spatial": {
            "frames": [
                {
                    "valid_time": "2026-08-11T06:00:00Z",
                    "longitudes": flat_lon,
                    "latitudes": flat_lat,
                    "hard_reasons": flat_reasons,
                    "risk_scores": [0.1] * 9,
                    "risk_levels": [1] * 9,
                    "confidences": [1.0] * 9,
                    "available": [not value for value in flat_hard],
                }
            ]
        },
    }


def test_viewer_projection_regression_oracle() -> None:
    scenario = _viewer_scenario(land_cell=(1, 1))
    legacy = viewer_pixel_intersections(scenario, fixed_projection=False)
    fixed = viewer_pixel_intersections(scenario, fixed_projection=True)
    assert legacy > 0
    assert fixed == 0


@pytest.mark.skipif(
    not MUR_OUT.is_dir() or not TROMSO_OUT.is_dir(),
    reason="frozen RC2 outputs not present",
)
def test_real_frozen_geo_integrity_pass() -> None:
    report = run_geo_integrity_audit(CONFIG)
    assert report.overall_status == "PASS"
    assert len(report.scenarios) == 2
    for scenario in report.scenarios:
        assert scenario.total_routes == 24
        assert scenario.passed_routes == 24
        assert scenario.viewer_projection_intersections == 0
        assert scenario.waypoint_hard_violations == 0
        assert scenario.edge_hard_violations == 0
        assert scenario.corner_cutting_violations == 0


@pytest.mark.skipif(
    not MUR_OUT.is_dir() or not TROMSO_OUT.is_dir(),
    reason="frozen RC2 outputs not present",
)
def test_historical_mixed_projection_would_have_failed() -> None:
    """Regression evidence: the pre-fix viewer really did draw correct routes
    across LAND cells because cells and routes used different transforms."""

    config = CONFIG.read_text(encoding="utf-8")
    import json

    data = json.loads(config)
    for key in ("scenario_a", "scenario_b"):
        item = data[key]
        source = FrozenScenarioSource(
            scenario_id=item["scenario_id"],
            display_name=item["display_name"],
            output_dir=item["output_dir"],
            expected=dict(item["expected"]),
            rc1_golden_run_report=item.get("rc1_golden_run_report"),
            risk_store_root=item.get("risk_store_root"),
            notes=tuple(item.get("notes", ())),
        )
        scenario = load_frozen_scenario(source)
        legacy = viewer_pixel_intersections(scenario.to_dict(), fixed_projection=False)
        assert legacy > 0
