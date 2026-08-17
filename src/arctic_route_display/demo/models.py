"""Unified demo-facing data model built from frozen/live C artifacts."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


class ResultOrigin:
    """Honest origin marker for every demo result."""

    FROZEN_VALIDATED = "FROZEN_VALIDATED"
    LIVE_COMPUTED = "LIVE_COMPUTED"


@dataclass(frozen=True, slots=True)
class DemoRoute:
    planning_layer: str
    objective: str
    waypoints: tuple[dict[str, Any], ...]
    distance_km: float
    eta_hours: float
    avg_risk: float
    max_risk: float
    integrated_risk_hours: float
    minimum_confidence: float
    hard_constraint_violations: int
    turn_count: int
    objective_cost: float
    expanded_nodes: int | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "planning_layer": self.planning_layer,
            "objective": self.objective,
            "waypoints": list(self.waypoints),
            "metrics": {
                "distance_km": self.distance_km,
                "eta_hours": self.eta_hours,
                "avg_risk": self.avg_risk,
                "max_risk": self.max_risk,
                "integrated_risk_hours": self.integrated_risk_hours,
                "minimum_confidence": self.minimum_confidence,
                "hard_constraint_violations": self.hard_constraint_violations,
                "turn_count": self.turn_count,
                "objective_cost": self.objective_cost,
                "expanded_nodes": self.expanded_nodes,
            },
        }


@dataclass(frozen=True, slots=True)
class DemoPhase:
    phase: str
    layer_set_id: str
    routes: tuple[DemoRoute, ...]

    def to_dict(self) -> dict[str, Any]:
        return {
            "phase": self.phase,
            "layer_set_id": self.layer_set_id,
            "routes": [route.to_dict() for route in self.routes],
        }


@dataclass(frozen=True, slots=True)
class DemoCoverage:
    gate_passed: bool
    frames_checked: int
    frames_expected: int
    total_nodes: int
    planning_available_nodes: int
    land_nodes: int
    data_unavailable_nodes: int
    other_hard_nodes: int
    unknown_navigable_nodes: int
    ice_free_neutralized_nodes: int
    finite_coverage_percent: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "gate_passed": self.gate_passed,
            "frames_checked": self.frames_checked,
            "frames_expected": self.frames_expected,
            "total_nodes": self.total_nodes,
            "planning_available_nodes": self.planning_available_nodes,
            "land_nodes": self.land_nodes,
            "data_unavailable_nodes": self.data_unavailable_nodes,
            "other_hard_nodes": self.other_hard_nodes,
            "unknown_navigable_nodes": self.unknown_navigable_nodes,
            "ice_free_neutralized_nodes": self.ice_free_neutralized_nodes,
            "finite_coverage_percent": self.finite_coverage_percent,
        }


@dataclass(frozen=True, slots=True)
class DemoFrameView:
    """One real risk frame reduced to presentation-sized arrays."""

    frame_index: int
    valid_time: str
    longitudes: tuple[float, ...]
    latitudes: tuple[float, ...]
    hard_reasons: tuple[str, ...]
    risk_scores: tuple[float, ...]
    risk_levels: tuple[int, ...]
    confidences: tuple[float, ...]
    available: tuple[bool, ...]

    def to_dict(self) -> dict[str, Any]:
        return {
            "frame_index": self.frame_index,
            "valid_time": self.valid_time,
            "longitudes": list(self.longitudes),
            "latitudes": list(self.latitudes),
            "hard_reasons": list(self.hard_reasons),
            "risk_scores": list(self.risk_scores),
            "risk_levels": list(self.risk_levels),
            "confidences": list(self.confidences),
            "available": list(self.available),
        }


@dataclass(frozen=True, slots=True)
class DemoSpatial:
    """Real grid coordinates and risk/availability state for display."""

    commit_id: str
    grid_id: str
    frames: tuple[DemoFrameView, ...]

    def to_dict(self) -> dict[str, Any]:
        return {
            "commit_id": self.commit_id,
            "grid_id": self.grid_id,
            "frames": [frame.to_dict() for frame in self.frames],
        }


@dataclass(frozen=True, slots=True)
class DemoRouteDelta:
    """Initial-to-replanned business delta for one layer/objective pair."""

    planning_layer: str
    objective: str
    distance_km: float
    eta_hours: float
    avg_risk: float
    max_risk: float
    integrated_risk_hours: float
    hard_constraint_violations: int
    turn_count: int
    objective_cost: float
    route_changed: bool

    def to_dict(self) -> dict[str, Any]:
        return {
            "planning_layer": self.planning_layer,
            "objective": self.objective,
            "distance_km": self.distance_km,
            "eta_hours": self.eta_hours,
            "avg_risk": self.avg_risk,
            "max_risk": self.max_risk,
            "integrated_risk_hours": self.integrated_risk_hours,
            "hard_constraint_violations": self.hard_constraint_violations,
            "turn_count": self.turn_count,
            "objective_cost": self.objective_cost,
            "route_changed": self.route_changed,
        }


def compute_phase_deltas(
    initial: DemoPhase,
    replanned: DemoPhase,
) -> tuple[DemoRouteDelta, ...]:
    """Business deltas from real initial/replanned artifacts (replanned - initial)."""

    by_key = {
        (route.planning_layer, route.objective): route for route in replanned.routes
    }
    deltas: list[DemoRouteDelta] = []
    for route in initial.routes:
        other = by_key.get((route.planning_layer, route.objective))
        if other is None:
            continue
        deltas.append(
            DemoRouteDelta(
                planning_layer=route.planning_layer,
                objective=route.objective,
                distance_km=other.distance_km - route.distance_km,
                eta_hours=other.eta_hours - route.eta_hours,
                avg_risk=other.avg_risk - route.avg_risk,
                max_risk=other.max_risk - route.max_risk,
                integrated_risk_hours=other.integrated_risk_hours
                - route.integrated_risk_hours,
                hard_constraint_violations=other.hard_constraint_violations
                - route.hard_constraint_violations,
                turn_count=other.turn_count - route.turn_count,
                objective_cost=other.objective_cost - route.objective_cost,
                route_changed=route.waypoints != other.waypoints,
            )
        )
    return tuple(deltas)


@dataclass(frozen=True, slots=True)
class DemoScenario:
    scenario_id: str
    display_name: str
    corridor_id: str
    corridor_version: str
    bundle_id: str
    run_context_id: str
    result_origin: str
    phases: tuple[DemoPhase, ...]
    coverage: DemoCoverage
    source_dir: str
    scenario_mode: str = ""
    simulation_start: str = ""
    simulation_end: str = ""
    knowledge_as_of: str = ""
    notes: tuple[str, ...] = field(default_factory=tuple)
    spatial: DemoSpatial | None = None
    phase_deltas: tuple[DemoRouteDelta, ...] = field(default_factory=tuple)

    def to_dict(self) -> dict[str, Any]:
        return {
            "scenario_id": self.scenario_id,
            "display_name": self.display_name,
            "corridor_id": self.corridor_id,
            "corridor_version": self.corridor_version,
            "bundle_id": self.bundle_id,
            "run_context_id": self.run_context_id,
            "result_origin": self.result_origin,
            "phases": [phase.to_dict() for phase in self.phases],
            "coverage": self.coverage.to_dict(),
            "source_dir": self.source_dir,
            "scenario_mode": self.scenario_mode,
            "simulation_start": self.simulation_start,
            "simulation_end": self.simulation_end,
            "knowledge_as_of": self.knowledge_as_of,
            "notes": list(self.notes),
            "spatial": None if self.spatial is None else self.spatial.to_dict(),
            "phase_deltas": [delta.to_dict() for delta in self.phase_deltas],
        }
