"""Display-facing models for v3 route-plan sets and v2 fallback batches."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True, slots=True)
class LayerView:
    layer_id: str
    objectives: tuple[str, ...]
    plans: tuple[dict[str, Any], ...]


@dataclass(frozen=True, slots=True)
class RouteSetView:
    schema_version: str
    group_id: str
    run_id: str
    scenario_id: str
    generation_id: int
    input_revision: int
    layers: tuple[LayerView, ...]
    source_path: str | None = None

    @property
    def route_count(self) -> int:
        return sum(len(layer.plans) for layer in self.layers)

    @property
    def is_complete(self) -> bool:
        return len(self.layers) == 4 and all(
            len(layer.plans) == 3 for layer in self.layers
        )


@dataclass(frozen=True, slots=True)
class V2BatchView:
    schema_version: str
    run_id: str
    scenario_id: str
    generation_id: int
    objectives: tuple[str, ...]
    plans: tuple[dict[str, Any], ...]
    source_path: str | None = None


@dataclass(frozen=True, slots=True)
class TradeoffsView:
    """Read-only tradeoff deltas between the selected and baseline routes."""

    delta_distance_km: float
    delta_eta_hours: float
    delta_avg_risk: float
    delta_max_risk: float
    delta_integrated_risk_hours: float
    avg_risk_reduction_pct: float
    max_risk_reduction_pct: float


@dataclass(frozen=True, slots=True)
class SelectionRationaleView:
    """Read-only CD selection-rationale sidecar (why recommended over fastest)."""

    schema_version: str
    run_id: str
    scenario_id: str
    corridor_id: str
    vessel_profile_id: str
    generation_id: int
    input_revision: int
    selected_plan_id: str
    baseline_plan_id: str
    selected_objective: str
    baseline_objective: str
    tradeoffs: TradeoffsView
    summary_text: str
    source_path: str | None = None


@dataclass(frozen=True, slots=True)
class CoveragePreflightView:
    """Read-only planning coverage preflight produced by the orchestrator."""

    schema_version: str
    run_id: str
    scenario_id: str
    corridor_id: str
    generation_id: int
    input_revision: int
    frames_expected: int
    frames_checked: int
    gate_passed: bool
    worst_frame: dict[str, Any] | None
    frames: tuple[dict[str, Any], ...]
    source_path: str | None = None

    @property
    def total_nodes(self) -> int:
        return self.frames[0]["total_nodes"] if self.frames else 0

    @property
    def hard_nodes(self) -> int:
        return self.frames[0]["hard_nodes"] if self.frames else 0

    @property
    def land_nodes(self) -> int:
        return self.frames[0]["land_nodes"] if self.frames else 0

    @property
    def data_unavailable_nodes(self) -> int:
        return self.frames[0]["data_unavailable_nodes"] if self.frames else 0

    @property
    def ice_free_neutralized_nodes(self) -> int:
        return int(self.frames[0].get("ice_free_neutralized_nodes", 0)) if self.frames else 0


@dataclass(slots=True)
class DisplayState:
    """Latest complete group plus optional previous group and v2 fallback."""

    latest_complete: RouteSetView | None = None
    previous_complete: RouteSetView | None = None
    v2_fallback: V2BatchView | None = None
    selection_rationale: SelectionRationaleView | None = None
    selected_layer: str | None = None
    warnings: list[str] = field(default_factory=list)

    @property
    def status(self) -> str:
        if self.latest_complete is not None:
            return "complete"
        if self.v2_fallback is not None:
            return "fallback_v2"
        return "empty"

    def publish_v3(self, view: RouteSetView) -> None:
        if not view.is_complete:
            self.warnings.append("rejected_incomplete_v3_group")
            return
        if (
            self.latest_complete is not None
            and self.latest_complete.group_id != view.group_id
        ):
            self.previous_complete = self.latest_complete
        self.latest_complete = view

    def set_v2_fallback(self, view: V2BatchView) -> None:
        self.v2_fallback = view

    def set_selection_rationale(self, view: SelectionRationaleView) -> None:
        if view.schema_version != "selection-rationale.v1":
            self.warnings.append("rejected_invalid_rationale_schema")
            return
        group = self.latest_complete
        mismatched = (
            group is not None and group.run_id != view.run_id
        ) or (
            self.v2_fallback is not None
            and self.v2_fallback.run_id != view.run_id
        )
        if mismatched:
            self.warnings.append("rationale_run_id_mismatch")
        self.selection_rationale = view
