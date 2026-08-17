"""Load a LIVE_COMPUTED small-window replanning result for display."""

from __future__ import annotations

import json
from pathlib import Path

from arctic_route_display.demo.frozen_loader import DemoValidationError
from arctic_route_display.demo.models import (
    DemoCoverage,
    DemoPhase,
    DemoRoute,
    DemoScenario,
    ResultOrigin,
)


def load_live_result(
    path: str | Path,
    *,
    frozen_coverage: DemoCoverage | None = None,
) -> DemoScenario:
    """Load a d.live-result.v1 document; TIMEOUT/FAIL raise transparently."""

    document = json.loads(Path(path).read_text(encoding="utf-8"))
    if document.get("schema_version") != "d.live-result.v1":
        raise DemoValidationError("live result schema_version mismatch")
    if document.get("status") in ("TIMEOUT", "FAIL"):
        raise DemoValidationError(
            f"live computation {document.get('status')}: {document.get('message', '')}"
        )
    if document.get("result_origin") != ResultOrigin.LIVE_COMPUTED:
        raise DemoValidationError("live result must be LIVE_COMPUTED")
    metrics = document["metrics"]
    route = DemoRoute(
        planning_layer="live_replan",
        objective=document.get("objective", "recommended"),
        waypoints=tuple(document["waypoints"]),
        distance_km=float(metrics["distance_km"]),
        eta_hours=float(metrics["eta_hours"]),
        avg_risk=float(metrics["avg_risk"]),
        max_risk=float(metrics["max_risk"]),
        integrated_risk_hours=float(metrics["integrated_risk_hours"]),
        minimum_confidence=float(metrics["minimum_confidence"]),
        hard_constraint_violations=int(metrics["hard_constraint_violations"]),
        turn_count=int(metrics["turn_count"]),
        objective_cost=float(metrics["objective_cost"]),
    )
    coverage = frozen_coverage or DemoCoverage(
        gate_passed=False,
        frames_checked=0,
        frames_expected=0,
        total_nodes=0,
        planning_available_nodes=0,
        land_nodes=0,
        data_unavailable_nodes=0,
        other_hard_nodes=0,
        unknown_navigable_nodes=0,
        ice_free_neutralized_nodes=0,
        finite_coverage_percent=0.0,
    )
    return DemoScenario(
        scenario_id=document.get("scenario_id", "tromso_isfjorden_rc2_smoke_v1"),
        display_name="Tromsø → Isfjorden Live Demo Smoke",
        corridor_id=document.get("corridor_id", "tromso_to_isfjorden_outer"),
        corridor_version=document.get("corridor_version", "1.2.0"),
        bundle_id=document.get("bundle_id", ""),
        run_context_id=document.get("run_id", ""),
        result_origin=ResultOrigin.LIVE_COMPUTED,
        phases=(DemoPhase(phase="replanned", layer_set_id="", routes=(route,)),),
        coverage=coverage,
        source_dir=str(path),
        notes=(
            *tuple(document.get("notes", ())),
            "Coverage panel reuses the frozen Scenario B committed window "
            "(same risk frames); only the route was recomputed live.",
        ),
    )
