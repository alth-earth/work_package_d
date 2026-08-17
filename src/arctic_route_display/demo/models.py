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
    notes: tuple[str, ...] = field(default_factory=tuple)

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
            "notes": list(self.notes),
        }
