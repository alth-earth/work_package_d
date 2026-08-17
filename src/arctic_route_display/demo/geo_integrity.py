"""Machine-verifiable Route Geospatial Integrity audit for frozen demo artifacts.

The gate checks the complete C -> artifact -> D -> viewer chain:

* route representation (waypoints are exact grid nodes, adjacent, and their
  summed great-circle distance / ETA deltas reproduce the published metrics);
* waypoint hard violations at each waypoint's exact ETA;
* edge hard violations along the straight segment, using both the planner's
  configured sample pattern and a dense ~10 km sample;
* diagonal corner cutting (hard orthogonal side cells);
* temporal mapping (ETA inside the risk window, hourly frame bracket found);
* viewer projection consistency (the same geographic projection used for
  grid cells and route polylines produces zero LAND / DATA_UNAVAILABLE /
  OTHER pixel-space intersections).

The audit only reads frozen artifacts and committed risk frames.  It never
modifies them and never re-runs the planner.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from arctic_route_display.demo.frozen_loader import (
    FrozenScenarioSource,
    load_frozen_scenario,
)

EARTH_RADIUS_KM = 6_371.0088
WAYPOINT_ON_LAND = "WAYPOINT_ON_LAND"
WAYPOINT_DATA_UNAVAILABLE = "WAYPOINT_DATA_UNAVAILABLE"
EDGE_LAND_INTERSECTION = "EDGE_LAND_INTERSECTION"
EDGE_DATA_UNAVAILABLE = "EDGE_DATA_UNAVAILABLE"
OTHER_VIOLATION = "OTHER"
DIAGONAL_CORNER_CUT = "DIAGONAL_CORNER_CUT"
TEMPORAL_FRAME_MISMATCH = "TEMPORAL_FRAME_MISMATCH"
ROUTE_REPRESENTATION_MISMATCH = "ROUTE_REPRESENTATION_MISMATCH"
COORDINATE_TRANSFORM_MISMATCH = "COORDINATE_TRANSFORM_MISMATCH"

_VIEWER_W = 1000.0
_VIEWER_H = 620.0
_VIEWER_PAD = 30.0


def _parse_utc(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(UTC)


def _format_utc(value: datetime) -> str:
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


def _haversine_km(
    lon_a: float,
    lat_a: float,
    lon_b: float,
    lat_b: float,
) -> float:
    lat1 = math.radians(lat_a)
    lat2 = math.radians(lat_b)
    delta_lat = lat2 - lat1
    delta_lon = math.radians(lon_b - lon_a)
    h = (
        math.sin(delta_lat / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin(delta_lon / 2) ** 2
    )
    return 2 * EARTH_RADIUS_KM * math.asin(min(1.0, math.sqrt(h)))


@dataclass(frozen=True, slots=True)
class GeoIntegrityViolation:
    scenario_id: str
    phase: str
    planning_layer: str
    objective: str
    route_id: str
    edge_index: int | None
    from_node: tuple[int, int] | None
    to_node: tuple[int, int] | None
    from_lonlat: tuple[float, float] | None
    to_lonlat: tuple[float, float] | None
    eta: str | None
    simulation_timestamp: str | None
    risk_frame_index: int | None
    risk_frame_timestamp: str | None
    grid_index: str | None
    hard: bool
    hard_reason: str | None
    violation_type: str
    detail: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "scenario_id": self.scenario_id,
            "phase": self.phase,
            "layer": self.planning_layer,
            "objective": self.objective,
            "route_id": self.route_id,
            "edge_index": self.edge_index,
            "from_node": list(self.from_node) if self.from_node else None,
            "to_node": list(self.to_node) if self.to_node else None,
            "from_lonlat": list(self.from_lonlat) if self.from_lonlat else None,
            "to_lonlat": list(self.to_lonlat) if self.to_lonlat else None,
            "eta": self.eta,
            "simulation_timestamp": self.simulation_timestamp,
            "risk_frame_index": self.risk_frame_index,
            "risk_frame_timestamp": self.risk_frame_timestamp,
            "grid_index": self.grid_index,
            "hard": self.hard,
            "hard_reason": self.hard_reason,
            "violation_type": self.violation_type,
            "detail": self.detail,
        }


@dataclass(frozen=True, slots=True)
class GeoIntegrityRouteResult:
    scenario_id: str
    phase: str
    planning_layer: str
    objective: str
    route_id: str
    waypoint_count: int
    edge_count: int
    representation_status: str
    waypoint_hard_violations: int
    edge_hard_violations: int
    land_intersections: int
    data_unavailable_violations: int
    other_hard_violations: int
    corner_cutting_violations: int
    temporal_mapping_status: str
    violations: tuple[GeoIntegrityViolation, ...] = ()

    @property
    def status(self) -> str:
        return "PASS" if not self.violations else "FAIL"

    def to_dict(self) -> dict[str, Any]:
        return {
            "scenario_id": self.scenario_id,
            "phase": self.phase,
            "layer": self.planning_layer,
            "objective": self.objective,
            "route_id": self.route_id,
            "status": self.status,
            "waypoint_count": self.waypoint_count,
            "edge_count": self.edge_count,
            "waypoint_hard_violations": self.waypoint_hard_violations,
            "edge_hard_violations": self.edge_hard_violations,
            "land_intersections": self.land_intersections,
            "data_unavailable_violations": self.data_unavailable_violations,
            "other_hard_violations": self.other_hard_violations,
            "corner_cutting_violations": self.corner_cutting_violations,
            "representation_status": self.representation_status,
            "temporal_mapping_status": self.temporal_mapping_status,
            "violations": [violation.to_dict() for violation in self.violations],
        }


@dataclass(frozen=True, slots=True)
class GeoIntegrityScenarioResult:
    scenario_id: str
    routes: tuple[GeoIntegrityRouteResult, ...]
    viewer_projection_intersections: int
    coordinate_transform_status: str
    temporal_mapping_status: str
    route_representation_status: str

    @property
    def total_routes(self) -> int:
        return len(self.routes)

    @property
    def passed_routes(self) -> int:
        return sum(route.status == "PASS" for route in self.routes)

    @property
    def failed_routes(self) -> int:
        return self.total_routes - self.passed_routes

    @property
    def waypoint_hard_violations(self) -> int:
        return sum(route.waypoint_hard_violations for route in self.routes)

    @property
    def edge_hard_violations(self) -> int:
        return sum(route.edge_hard_violations for route in self.routes)

    @property
    def land_intersections(self) -> int:
        return sum(route.land_intersections for route in self.routes)

    @property
    def data_unavailable_violations(self) -> int:
        return sum(route.data_unavailable_violations for route in self.routes)

    @property
    def other_hard_violations(self) -> int:
        return sum(route.other_hard_violations for route in self.routes)

    @property
    def corner_cutting_violations(self) -> int:
        return sum(route.corner_cutting_violations for route in self.routes)

    @property
    def status(self) -> str:
        if (
            self.failed_routes
            or self.viewer_projection_intersections
            or self.coordinate_transform_status != "PASS"
            or self.temporal_mapping_status != "PASS"
            or self.route_representation_status != "PASS"
        ):
            return "FAIL"
        return "PASS"

    def summary(self) -> dict[str, Any]:
        return {
            "scenario_id": self.scenario_id,
            "status": self.status,
            "routes_audited": self.total_routes,
            "routes_passed": self.passed_routes,
            "routes_failed": self.failed_routes,
            "waypoint_hard_violations": self.waypoint_hard_violations,
            "edge_hard_violations": self.edge_hard_violations,
            "land_intersections": self.land_intersections,
            "data_unavailable_violations": self.data_unavailable_violations,
            "other_hard_violations": self.other_hard_violations,
            "corner_cutting_violations": self.corner_cutting_violations,
            "temporal_mapping_status": self.temporal_mapping_status,
            "route_representation_status": self.route_representation_status,
            "coordinate_transform_status": self.coordinate_transform_status,
            "viewer_projection_intersections": self.viewer_projection_intersections,
        }

    def to_dict(self) -> dict[str, Any]:
        return {
            **self.summary(),
            "routes": [route.to_dict() for route in self.routes],
        }


@dataclass(frozen=True, slots=True)
class GeoIntegrityReport:
    generated_at: str
    scenarios: tuple[GeoIntegrityScenarioResult, ...]
    notes: tuple[str, ...] = ()

    @property
    def overall_status(self) -> str:
        return "PASS" if all(scenario.status == "PASS" for scenario in self.scenarios) else "FAIL"

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema_version": "d.route-geospatial-integrity.v1",
            "generated_at": self.generated_at,
            "overall_status": self.overall_status,
            "scenarios": [scenario.to_dict() for scenario in self.scenarios],
            "notes": list(self.notes),
        }


def _axis_weights(
    coordinates: tuple[float, ...],
    target: float,
) -> tuple[tuple[int, float], ...] | None:
    if not math.isfinite(target):
        return None
    if len(coordinates) < 2:
        if abs(coordinates[0] - target) <= 1e-10:
            return ((0, 1.0),)
        return None
    ascending = coordinates[0] < coordinates[-1]
    ordered = coordinates if ascending else tuple(reversed(coordinates))
    tolerance = 1e-10
    if target < ordered[0] - tolerance or target > ordered[-1] + tolerance:
        return None
    exact = [i for i, value in enumerate(ordered) if abs(value - target) <= tolerance]
    if exact:
        index = exact[0]
        return ((index if ascending else len(coordinates) - 1 - index, 1.0),)
    upper = 0
    while upper < len(ordered) and ordered[upper] <= target:
        upper += 1
    lower = upper - 1
    if lower < 0 or upper >= len(ordered):
        return None
    fraction = (target - ordered[lower]) / (ordered[upper] - ordered[lower])
    lower_index = lower if ascending else len(coordinates) - 1 - lower
    upper_index = upper if ascending else len(coordinates) - 1 - upper
    return ((lower_index, 1.0 - fraction), (upper_index, fraction))


def _bilinear_hard(
    frame: dict[str, Any],
    longitude: float,
    latitude: float,
) -> tuple[bool, frozenset[str]]:
    """Replicate C RiskSampler hard_mask semantics at one lon/lat point."""

    payload = frame["payload"]
    coords = payload["coordinates"]
    latitudes = tuple(float(value) for value in coords["latitude"])
    longitudes = tuple(float(value) for value in coords["longitude"])
    hard = payload["variables"]["hard_mask"]
    reasons = payload["variables"]["hard_reason"]
    lat_weights = _axis_weights(latitudes, float(latitude))
    lon_weights = _axis_weights(longitudes, float(longitude))
    if lat_weights is None or lon_weights is None:
        return False, frozenset()
    contributors = [
        (lat_index, lon_index, lat_weight * lon_weight)
        for lat_index, lat_weight in lat_weights
        for lon_index, lon_weight in lon_weights
        if lat_weight * lon_weight > 0.0
    ]
    hard_values = [
        (bool(hard[row][column]), reasons[row][column])
        for row, column, _ in contributors
    ]
    return any(value for value, _ in hard_values), frozenset(
        reason for value, reason in hard_values if value
    )


def _load_frames(risk_store_root: str | Path, output_dir: str | Path) -> tuple[dict[str, Any], ...]:
    commit_path = Path(output_dir) / "risk" / "full-window-commit.json"
    commit = json.loads(commit_path.read_text(encoding="utf-8"))
    store = Path(risk_store_root)
    frames: list[dict[str, Any]] = []
    for meta in commit["frames"]:
        risk_id = meta["risk_id"]
        document = json.loads((store / "frames" / f"{risk_id}.json").read_text(encoding="utf-8"))
        if document.get("risk_id") != risk_id:
            raise ValueError(f"risk frame identity mismatch: {risk_id}")
        frames.append(document)
    frames.sort(key=lambda item: _parse_utc(str(item["valid_time"])))
    return tuple(frames)


def _frame_bracket(
    frames: tuple[dict[str, Any], ...],
    sampled_at: datetime,
) -> tuple[int, int] | None:
    times = [_parse_utc(str(frame["valid_time"])) for frame in frames]
    if sampled_at < times[0] or sampled_at > times[-1]:
        return None
    lower = 0
    upper = len(times)
    while lower < upper:
        middle = (lower + upper) // 2
        if times[middle] < sampled_at:
            lower = middle + 1
        else:
            upper = middle
    if lower < len(times) and times[lower] == sampled_at:
        return lower, lower
    if lower == 0:
        return None
    return lower - 1, lower


def _sample_hard(
    frames: tuple[dict[str, Any], ...],
    longitude: float,
    latitude: float,
    sampled_at: datetime,
) -> tuple[bool, frozenset[str], int | None, str | None]:
    bracket = _frame_bracket(frames, sampled_at)
    if bracket is None:
        return False, frozenset(), None, None
    lower, upper = bracket
    lower_hard, lower_reasons = _bilinear_hard(frames[lower], longitude, latitude)
    if lower == upper:
        return (
            lower_hard,
            lower_reasons,
            lower,
            _format_utc(_parse_utc(str(frames[lower]["valid_time"]))),
        )
    upper_hard, upper_reasons = _bilinear_hard(frames[upper], longitude, latitude)
    return (
        lower_hard or upper_hard,
        lower_reasons | upper_reasons,
        lower,
        _format_utc(_parse_utc(str(frames[lower]["valid_time"]))),
    )


def _grid_node(
    coords: dict[str, Any],
    longitude: float,
    latitude: float,
) -> tuple[int, int] | None:
    latitudes = tuple(float(value) for value in coords["latitude"])
    longitudes = tuple(float(value) for value in coords["longitude"])
    rows = [
        row
        for row, value in enumerate(latitudes)
        if abs(value - float(latitude)) <= 1e-9
    ]
    columns = [
        column
        for column, value in enumerate(longitudes)
        if abs(value - float(longitude)) <= 1e-9
    ]
    if len(rows) == 1 and len(columns) == 1:
        return rows[0], columns[0]
    return None


def _violation(
    *,
    scenario_id: str,
    phase: str,
    planning_layer: str,
    objective: str,
    route_id: str,
    edge_index: int | None,
    from_node: tuple[int, int] | None,
    to_node: tuple[int, int] | None,
    from_lonlat: tuple[float, float] | None,
    to_lonlat: tuple[float, float] | None,
    eta: str | None,
    simulation_timestamp: str | None,
    risk_frame_index: int | None,
    risk_frame_timestamp: str | None,
    grid_index: str | None,
    hard: bool,
    hard_reason: str | None,
    violation_type: str,
    detail: str = "",
) -> GeoIntegrityViolation:
    return GeoIntegrityViolation(
        scenario_id=scenario_id,
        phase=phase,
        planning_layer=planning_layer,
        objective=objective,
        route_id=route_id,
        edge_index=edge_index,
        from_node=from_node,
        to_node=to_node,
        from_lonlat=from_lonlat,
        to_lonlat=to_lonlat,
        eta=eta,
        simulation_timestamp=simulation_timestamp,
        risk_frame_index=risk_frame_index,
        risk_frame_timestamp=risk_frame_timestamp,
        grid_index=grid_index,
        hard=hard,
        hard_reason=hard_reason,
        violation_type=violation_type,
        detail=detail,
    )


def audit_route(
    *,
    scenario_id: str,
    phase: str,
    planning_layer: str,
    objective: str,
    route_id: str,
    waypoints: tuple[dict[str, Any], ...],
    metrics: dict[str, Any],
    frames: tuple[dict[str, Any], ...],
    coords: dict[str, Any],
    max_edge_spacing_km: float = 10.0,
) -> GeoIntegrityRouteResult:
    """Audit one published route against committed risk frames."""

    violations: list[GeoIntegrityViolation] = []
    waypoint_hard_violations = 0
    edge_hard_violations = 0
    land_intersections = 0
    data_unavailable_violations = 0
    other_hard_violations = 0
    corner_cutting_violations = 0
    temporal_status = "PASS"
    representation_status = "PASS"

    if len(waypoints) < 2:
        violations.append(
            _violation(
                scenario_id=scenario_id,
                phase=phase,
                planning_layer=planning_layer,
                objective=objective,
                route_id=route_id,
                edge_index=None,
                from_node=None,
                to_node=None,
                from_lonlat=None,
                to_lonlat=None,
                eta=None,
                simulation_timestamp=None,
                risk_frame_index=None,
                risk_frame_timestamp=None,
                grid_index=None,
                hard=False,
                hard_reason=None,
                violation_type=ROUTE_REPRESENTATION_MISMATCH,
                detail="route has fewer than two waypoints",
            )
        )
        representation_status = "FAIL"

    nodes: list[tuple[int, int] | None] = []
    for waypoint in waypoints:
        nodes.append(
            _grid_node(coords, float(waypoint["longitude"]), float(waypoint["latitude"]))
        )

    if any(node is None for node in nodes):
        for index, (waypoint, node) in enumerate(zip(waypoints, nodes, strict=True)):
            if node is not None:
                continue
            violations.append(
                _violation(
                    scenario_id=scenario_id,
                    phase=phase,
                    planning_layer=planning_layer,
                    objective=objective,
                    route_id=route_id,
                    edge_index=None,
                    from_node=None,
                    to_node=None,
                    from_lonlat=(float(waypoint["longitude"]), float(waypoint["latitude"])),
                    to_lonlat=None,
                    eta=str(waypoint["eta"]),
                    simulation_timestamp=str(waypoint["eta"]),
                    risk_frame_index=None,
                    risk_frame_timestamp=None,
                    grid_index=None,
                    hard=False,
                    hard_reason=None,
                    violation_type=ROUTE_REPRESENTATION_MISMATCH,
                    detail=f"waypoint {index} is not an exact grid node",
                )
            )
        representation_status = "FAIL"

    for index in range(len(waypoints) - 1):
        start = waypoints[index]
        end = waypoints[index + 1]
        start_node = nodes[index]
        end_node = nodes[index + 1]
        if start_node is None or end_node is None:
            continue
        row_delta = abs(end_node[0] - start_node[0])
        column_delta = abs(end_node[1] - start_node[1])
        edge_kind = "diagonal" if row_delta == 1 and column_delta == 1 else (
            "orthogonal" if row_delta + column_delta == 1 else "invalid"
        )
        if edge_kind == "invalid" or row_delta > 1 or column_delta > 1:
            violations.append(
                _violation(
                    scenario_id=scenario_id,
                    phase=phase,
                    planning_layer=planning_layer,
                    objective=objective,
                    route_id=route_id,
                    edge_index=index,
                    from_node=start_node,
                    to_node=end_node,
                    from_lonlat=(float(start["longitude"]), float(start["latitude"])),
                    to_lonlat=(float(end["longitude"]), float(end["latitude"])),
                    eta=str(end["eta"]),
                    simulation_timestamp=str(end["eta"]),
                    risk_frame_index=None,
                    risk_frame_timestamp=None,
                    grid_index=f"edge:{index}",
                    hard=False,
                    hard_reason=None,
                    violation_type=ROUTE_REPRESENTATION_MISMATCH,
                    detail=(
                        f"consecutive waypoints are not 8-neighbors "
                        f"(dr={row_delta}, dc={column_delta})"
                    ),
                )
            )
            representation_status = "FAIL"
            continue

        start_eta = _parse_utc(str(start["eta"]))
        end_eta = _parse_utc(str(end["eta"]))
        if end_eta <= start_eta:
            violations.append(
                _violation(
                    scenario_id=scenario_id,
                    phase=phase,
                    planning_layer=planning_layer,
                    objective=objective,
                    route_id=route_id,
                    edge_index=index,
                    from_node=start_node,
                    to_node=end_node,
                    from_lonlat=(float(start["longitude"]), float(start["latitude"])),
                    to_lonlat=(float(end["longitude"]), float(end["latitude"])),
                    eta=str(end["eta"]),
                    simulation_timestamp=str(end["eta"]),
                    risk_frame_index=None,
                    risk_frame_timestamp=None,
                    grid_index=f"edge:{index}",
                    hard=False,
                    hard_reason=None,
                    violation_type=TEMPORAL_FRAME_MISMATCH,
                    detail="ETA is not strictly increasing",
                )
            )
            temporal_status = "FAIL"
            continue

        distance_km = _haversine_km(
            float(start["longitude"]),
            float(start["latitude"]),
            float(end["longitude"]),
            float(end["latitude"]),
        )
        sample_count = max(3, math.ceil(distance_km / max_edge_spacing_km) + 1)
        for sample_index in range(sample_count):
            fraction = sample_index / (sample_count - 1)
            longitude = float(start["longitude"]) + (
                float(end["longitude"]) - float(start["longitude"])
            ) * fraction
            latitude = float(start["latitude"]) + (
                float(end["latitude"]) - float(start["latitude"])
            ) * fraction
            sampled_at = start_eta + (end_eta - start_eta) * fraction
            hard, reasons, frame_index, frame_timestamp = _sample_hard(
                frames,
                longitude,
                latitude,
                sampled_at,
            )
            if frame_index is None:
                violations.append(
                    _violation(
                        scenario_id=scenario_id,
                        phase=phase,
                        planning_layer=planning_layer,
                        objective=objective,
                        route_id=route_id,
                        edge_index=index,
                        from_node=start_node,
                        to_node=end_node,
                        from_lonlat=(float(start["longitude"]), float(start["latitude"])),
                        to_lonlat=(float(end["longitude"]), float(end["latitude"])),
                        eta=str(end["eta"]),
                        simulation_timestamp=_format_utc(sampled_at),
                        risk_frame_index=None,
                        risk_frame_timestamp=None,
                        grid_index=f"edge:{index}:sample:{sample_index}",
                        hard=False,
                        hard_reason=None,
                        violation_type=TEMPORAL_FRAME_MISMATCH,
                        detail="sample time is outside the committed risk window",
                    )
                )
                temporal_status = "FAIL"
                continue
            if not hard:
                continue
            edge_hard_violations += 1
            reason = sorted(reasons)[0] if reasons else "OTHER"
            if reason == "LAND":
                land_intersections += 1
                violation_type = EDGE_LAND_INTERSECTION
            elif reason == "DATA_UNAVAILABLE":
                data_unavailable_violations += 1
                violation_type = EDGE_DATA_UNAVAILABLE
            else:
                other_hard_violations += 1
                violation_type = OTHER_VIOLATION
            violations.append(
                _violation(
                    scenario_id=scenario_id,
                    phase=phase,
                    planning_layer=planning_layer,
                    objective=objective,
                    route_id=route_id,
                    edge_index=index,
                    from_node=start_node,
                    to_node=end_node,
                    from_lonlat=(float(start["longitude"]), float(start["latitude"])),
                    to_lonlat=(float(end["longitude"]), float(end["latitude"])),
                    eta=str(end["eta"]),
                    simulation_timestamp=_format_utc(sampled_at),
                    risk_frame_index=frame_index,
                    risk_frame_timestamp=frame_timestamp,
                    grid_index=f"edge:{index}:sample:{sample_index}",
                    hard=True,
                    hard_reason=reason,
                    violation_type=violation_type,
                    detail=(
                        f"sample lon={longitude:.6f} lat={latitude:.6f} "
                        f"at {_format_utc(sampled_at)}"
                    ),
                )
            )

        if edge_kind == "diagonal":
            row_low = min(start_node[0], end_node[0])
            row_high = max(start_node[0], end_node[0])
            column_low = min(start_node[1], end_node[1])
            column_high = max(start_node[1], end_node[1])
            side_cells = ((row_low, column_high), (row_high, column_low))
            mid_eta = start_eta + (end_eta - start_eta) * 0.5
            for side_node in side_cells:
                latitude = coords["latitude"][side_node[0]]
                longitude = coords["longitude"][side_node[1]]
                hard, reasons, frame_index, frame_timestamp = _sample_hard(
                    frames,
                    float(longitude),
                    float(latitude),
                    mid_eta,
                )
                if not hard:
                    continue
                corner_cutting_violations += 1
                reason = sorted(reasons)[0] if reasons else "OTHER"
                violations.append(
                    _violation(
                        scenario_id=scenario_id,
                        phase=phase,
                        planning_layer=planning_layer,
                        objective=objective,
                        route_id=route_id,
                        edge_index=index,
                        from_node=start_node,
                        to_node=end_node,
                        from_lonlat=(float(start["longitude"]), float(start["latitude"])),
                        to_lonlat=(float(end["longitude"]), float(end["latitude"])),
                        eta=str(end["eta"]),
                        simulation_timestamp=_format_utc(mid_eta),
                        risk_frame_index=frame_index,
                        risk_frame_timestamp=frame_timestamp,
                        grid_index=f"side:{side_node}",
                        hard=True,
                        hard_reason=reason,
                        violation_type=DIAGONAL_CORNER_CUT,
                        detail=f"hard orthogonal side cell {side_node}",
                    )
                )

    # Waypoint hard checks at exact ETA.
    for index, waypoint in enumerate(waypoints):
        eta = _parse_utc(str(waypoint["eta"]))
        hard, reasons, frame_index, frame_timestamp = _sample_hard(
            frames,
            float(waypoint["longitude"]),
            float(waypoint["latitude"]),
            eta,
        )
        if not hard:
            continue
        waypoint_hard_violations += 1
        reason = sorted(reasons)[0] if reasons else "OTHER"
        if reason == "LAND":
            land_intersections += 1
            violation_type = WAYPOINT_ON_LAND
        elif reason == "DATA_UNAVAILABLE":
            data_unavailable_violations += 1
            violation_type = WAYPOINT_DATA_UNAVAILABLE
        else:
            other_hard_violations += 1
            violation_type = OTHER_VIOLATION
        violations.append(
            _violation(
                scenario_id=scenario_id,
                phase=phase,
                planning_layer=planning_layer,
                objective=objective,
                route_id=route_id,
                edge_index=None,
                from_node=nodes[index],
                to_node=None,
                from_lonlat=(float(waypoint["longitude"]), float(waypoint["latitude"])),
                to_lonlat=None,
                eta=str(waypoint["eta"]),
                simulation_timestamp=str(waypoint["eta"]),
                risk_frame_index=frame_index,
                risk_frame_timestamp=frame_timestamp,
                grid_index=f"waypoint:{index}:{nodes[index]}",
                hard=True,
                hard_reason=reason,
                violation_type=violation_type,
                detail="waypoint node is hard-blocked at its ETA",
            )
        )

    # Published distance/ETA must be reproducible from consecutive waypoints.
    sum_distance = sum(
        _haversine_km(
            float(waypoints[index]["longitude"]),
            float(waypoints[index]["latitude"]),
            float(waypoints[index + 1]["longitude"]),
            float(waypoints[index + 1]["latitude"]),
        )
        for index in range(len(waypoints) - 1)
    )
    sum_eta_hours = sum(
        (_parse_utc(str(waypoints[index + 1]["eta"])) - _parse_utc(str(waypoints[index]["eta"])))
        .total_seconds()
        / 3600.0
        for index in range(len(waypoints) - 1)
    )
    if abs(sum_distance - float(metrics["distance_km"])) > 0.5:
        violations.append(
            _violation(
                scenario_id=scenario_id,
                phase=phase,
                planning_layer=planning_layer,
                objective=objective,
                route_id=route_id,
                edge_index=None,
                from_node=None,
                to_node=None,
                from_lonlat=None,
                to_lonlat=None,
                eta=None,
                simulation_timestamp=None,
                risk_frame_index=None,
                risk_frame_timestamp=None,
                grid_index=None,
                hard=False,
                hard_reason=None,
                violation_type=ROUTE_REPRESENTATION_MISMATCH,
                detail=(
                    f"sum of edge distances {sum_distance:.3f} km != "
                    f"published {float(metrics['distance_km']):.3f} km"
                ),
            )
        )
        representation_status = "FAIL"
    if abs(sum_eta_hours - float(metrics["eta_hours"])) > 0.01:
        violations.append(
            _violation(
                scenario_id=scenario_id,
                phase=phase,
                planning_layer=planning_layer,
                objective=objective,
                route_id=route_id,
                edge_index=None,
                from_node=None,
                to_node=None,
                from_lonlat=None,
                to_lonlat=None,
                eta=None,
                simulation_timestamp=None,
                risk_frame_index=None,
                risk_frame_timestamp=None,
                grid_index=None,
                hard=False,
                hard_reason=None,
                violation_type=ROUTE_REPRESENTATION_MISMATCH,
                detail=(
                    f"sum of ETA deltas {sum_eta_hours:.4f} h != "
                    f"published {float(metrics['eta_hours']):.4f} h"
                ),
            )
        )
        representation_status = "FAIL"

    return GeoIntegrityRouteResult(
        scenario_id=scenario_id,
        phase=phase,
        planning_layer=planning_layer,
        objective=objective,
        route_id=route_id,
        waypoint_count=len(waypoints),
        edge_count=max(0, len(waypoints) - 1),
        representation_status=representation_status,
        waypoint_hard_violations=waypoint_hard_violations,
        edge_hard_violations=edge_hard_violations,
        land_intersections=land_intersections,
        data_unavailable_violations=data_unavailable_violations,
        other_hard_violations=other_hard_violations,
        corner_cutting_violations=corner_cutting_violations,
        temporal_mapping_status=temporal_status,
        violations=tuple(violations),
    )


def _segment_intersects_rect(
    ax: float,
    ay: float,
    bx: float,
    by: float,
    rx: float,
    ry: float,
    rw: float,
    rh: float,
    epsilon: float = 1.0,
) -> bool:
    x1, x2 = sorted((ax, bx))
    y1, y2 = sorted((ay, by))
    left = rx - epsilon
    right = rx + rw + epsilon
    top = ry - epsilon
    bottom = ry + rh + epsilon
    if x2 < left or x1 > right or y2 < top or y1 > bottom:
        return False
    dx = bx - ax
    dy = by - ay
    p = (-dx, dx, -dy, dy)
    q = (ax - left, right - ax, ay - top, bottom - ay)
    u1 = 0.0
    u2 = 1.0
    for pi, qi in zip(p, q, strict=True):
        if pi == 0:
            if qi < 0:
                return False
            continue
        u = qi / pi
        if pi < 0:
            if u > u2:
                return False
            u1 = max(u1, u)
        else:
            if u < u1:
                return False
            u2 = min(u2, u)
    return True


def viewer_pixel_intersections(
    scenario: dict[str, Any],
    *,
    fixed_projection: bool = True,
) -> int:
    """Count route polyline / hard-cell rect intersections in viewer pixels.

    ``fixed_projection=True`` mirrors the corrected viewer: one aspect-preserving
    geographic projection for both grid cells and route polylines.
    ``fixed_projection=False`` mirrors the historical buggy viewer that used two
    different projections and is retained only as a regression oracle.
    """

    routes: list[tuple[str, str, str, list[dict[str, Any]]]] = []
    for phase in scenario["phases"]:
        for route in phase["routes"]:
            routes.append(
                (
                    phase["phase"],
                    route["planning_layer"],
                    route["objective"],
                    route["waypoints"],
                )
            )
    frames = scenario.get("spatial", {}).get("frames") or []
    if not routes or not frames:
        return 0
    points: list[tuple[float, float]] = []
    for _, _, _, waypoints in routes:
        for waypoint in waypoints:
            points.append((float(waypoint["longitude"]), float(waypoint["latitude"])))
    for frame in frames:
        points.append((min(frame["longitudes"]), min(frame["latitudes"])))
        points.append((max(frame["longitudes"]), max(frame["latitudes"])))
    min_lon = min(point[0] for point in points)
    max_lon = max(point[0] for point in points)
    min_lat = min(point[1] for point in points)
    max_lat = max(point[1] for point in points)
    span_lon = max(max_lon - min_lon, 1e-6)
    span_lat = max(max_lat - min_lat, 1e-6)
    scale = min(
        (_VIEWER_W - 2 * _VIEWER_PAD) / span_lon,
        (_VIEWER_H - 2 * _VIEWER_PAD) / span_lat,
    )
    offset_x = (_VIEWER_W - span_lon * scale) / 2
    offset_y = (_VIEWER_H - span_lat * scale) / 2

    def project(longitude: float, latitude: float) -> tuple[float, float]:
        return (
            offset_x + (longitude - min_lon) * scale,
            offset_y + (max_lat - latitude) * scale,
        )

    intersections = 0
    for _frame_index, frame in enumerate(frames):
        n_lon = len(set(frame["longitudes"]))
        n_lat = len(set(frame["latitudes"]))
        lon_min = min(frame["longitudes"])
        lon_max = max(frame["longitudes"])
        lat_min = min(frame["latitudes"])
        lat_max = max(frame["latitudes"])
        if fixed_projection:
            lon_step = (lon_max - lon_min) / max(n_lon - 1, 1)
            lat_step = (lat_max - lat_min) / max(n_lat - 1, 1)
            cell_w = max(lon_step * scale * 0.9, 1.5)
            cell_h = max(lat_step * scale * 0.9, 1.5)
            xs = [project(lon, frame["latitudes"][0])[0] for lon in frame["longitudes"]]
            ys = [project(frame["longitudes"][0], lat)[1] for lat in frame["latitudes"]]
        else:
            lon_scale = (_VIEWER_W - 2 * _VIEWER_PAD) / max(lon_max - lon_min, 1e-6)
            lat_scale = (_VIEWER_H - 2 * _VIEWER_PAD) / max(lat_max - lat_min, 1e-6)
            cell_w = max((_VIEWER_W - 2 * _VIEWER_PAD) / n_lon * 0.9, 1.5)
            cell_h = max((_VIEWER_H - 2 * _VIEWER_PAD) / n_lat * 0.9, 1.5)
            xs = [
                _VIEWER_PAD + (lon - lon_min) * lon_scale for lon in frame["longitudes"]
            ]
            ys = [
                _VIEWER_PAD + (lat_max - lat) * lat_scale for lat in frame["latitudes"]
            ]
        for cell_index, reason in enumerate(frame["hard_reasons"]):
            if reason not in ("LAND", "DATA_UNAVAILABLE", "OTHER"):
                continue
            rect_x = xs[cell_index] - cell_w / 2
            rect_y = ys[cell_index] - cell_h / 2
            for _, _, _, waypoints in routes:
                for edge_index in range(len(waypoints) - 1):
                    start = waypoints[edge_index]
                    end = waypoints[edge_index + 1]
                    ax, ay = project(float(start["longitude"]), float(start["latitude"]))
                    bx, by = project(float(end["longitude"]), float(end["latitude"]))
                    if _segment_intersects_rect(
                        ax,
                        ay,
                        bx,
                        by,
                        rect_x,
                        rect_y,
                        cell_w,
                        cell_h,
                    ):
                        intersections += 1
    return intersections


def audit_scenario(source: FrozenScenarioSource) -> GeoIntegrityScenarioResult:
    """Audit one frozen scenario (identity-verified) plus its risk frames."""

    scenario = load_frozen_scenario(source)
    frames = _load_frames(source.risk_store_root, source.output_dir)
    frame = frames[0]
    coords = frame["payload"]["coordinates"]
    route_results: list[GeoIntegrityRouteResult] = []
    temporal_status = "PASS"
    representation_status = "PASS"
    for phase in scenario.phases:
        route_file = Path(source.output_dir) / "routes" / "v3" / f"{phase.phase}.json"
        document = json.loads(route_file.read_text(encoding="utf-8"))
        for layer in document["layers"]:
            planning_layer = layer["planning_layer"]
            for objective, plan in layer["plans"].items():
                route_result = audit_route(
                    scenario_id=scenario.scenario_id,
                    phase=phase.phase,
                    planning_layer=planning_layer,
                    objective=objective,
                    route_id=str(plan.get("plan_id", "")),
                    waypoints=tuple(plan["waypoints"]),
                    metrics=plan["metrics"],
                    frames=frames,
                    coords=coords,
                )
                route_results.append(route_result)
                if route_result.temporal_mapping_status != "PASS":
                    temporal_status = "FAIL"
                if route_result.representation_status != "PASS":
                    representation_status = "FAIL"
    scenario_dict = scenario.to_dict()
    fixed_intersections = viewer_pixel_intersections(scenario_dict, fixed_projection=True)
    coordinate_status = "PASS" if fixed_intersections == 0 else "FAIL"
    return GeoIntegrityScenarioResult(
        scenario_id=scenario.scenario_id,
        routes=tuple(route_results),
        viewer_projection_intersections=fixed_intersections,
        coordinate_transform_status=coordinate_status,
        temporal_mapping_status=temporal_status,
        route_representation_status=representation_status,
    )


def run_geo_integrity_audit(
    config_path: str | Path,
) -> GeoIntegrityReport:
    """Audit all frozen scenarios in a demo frozen-sources config."""

    config = json.loads(Path(config_path).read_text(encoding="utf-8"))
    results: list[GeoIntegrityScenarioResult] = []
    for key in ("scenario_a", "scenario_b"):
        item = config[key]
        source = FrozenScenarioSource(
            scenario_id=item["scenario_id"],
            display_name=item["display_name"],
            output_dir=item["output_dir"],
            expected=dict(item["expected"]),
            rc1_golden_run_report=item.get("rc1_golden_run_report"),
            risk_store_root=item.get("risk_store_root"),
            notes=tuple(item.get("notes", ())),
        )
        if not source.risk_store_root:
            raise ValueError(f"{key} has no risk_store_root")
        results.append(audit_scenario(source))
    return GeoIntegrityReport(
        generated_at=_format_utc(datetime.now(UTC)),
        scenarios=tuple(results),
        notes=(
            "Audit reads frozen v3 artifacts and committed risk frames only; "
            "it never re-runs the planner and never mutates frozen data.",
            "Waypoint/edge checks use each waypoint's exact ETA and the risk "
            "frame(s) bracketing that ETA; hard_mask is OR'd like C's RiskSampler.",
            "Viewer projection check mirrors the corrected demo viewer: grid "
            "cells and route polylines share one aspect-preserving projection.",
        ),
    )
