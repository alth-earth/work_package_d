"""Load and identity-verify frozen v3 scenario artifacts for demo display."""

from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from arctic_route_display.demo.errors import DemoValidationError
from arctic_route_display.demo.models import (
    DemoCoverage,
    DemoPhase,
    DemoRoute,
    DemoScenario,
    ResultOrigin,
    compute_phase_deltas,
)
from arctic_route_display.demo.spatial import build_spatial


@dataclass(frozen=True, slots=True)
class FrozenScenarioSource:
    """One frozen v3 output directory plus its expected identity."""

    scenario_id: str
    display_name: str
    output_dir: str
    expected: dict[str, str]
    rc1_golden_run_report: str | None = None
    risk_store_root: str | None = None
    notes: tuple[str, ...] = ()


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _document_semantic_digest(path: Path) -> str:
    document = json.loads(path.read_text(encoding="utf-8"))
    for key in ("layer_set_id", "planning_request_id", "generated_at"):
        document.pop(key, None)
    for layer in document.get("layers", []):
        for plan in layer.get("plans", {}).values():
            for key in ("layer_set_id", "planning_request_id", "generated_at"):
                plan.pop(key, None)
            metrics = plan.get("metrics")
            if isinstance(metrics, dict):
                metrics.pop("compute_ms", None)
    encoded = json.dumps(
        document,
        ensure_ascii=False,
        allow_nan=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _check_checksums(output_dir: Path) -> None:
    manifest = json.loads((output_dir / "checksums.json").read_text(encoding="utf-8"))
    for relative, expected in manifest["files"].items():
        actual = _sha256_file(output_dir / relative)
        if actual != expected:
            raise DemoValidationError(f"checksum mismatch: {relative}")


def _coverage(preflight: Mapping[str, Any]) -> DemoCoverage:
    worst = preflight["worst_frame"]
    return DemoCoverage(
        gate_passed=bool(preflight["gate_passed"]),
        frames_checked=int(preflight["frames_checked"]),
        frames_expected=int(preflight["frames_expected"]),
        total_nodes=int(worst["total_nodes"]),
        planning_available_nodes=int(worst["navigable_nodes"]),
        land_nodes=int(worst["land_nodes"]),
        data_unavailable_nodes=int(worst["data_unavailable_nodes"]),
        other_hard_nodes=int(worst["other_hard_nodes"]),
        unknown_navigable_nodes=int(worst["unknown_navigable_nodes"]),
        ice_free_neutralized_nodes=int(
            worst.get("ice_free_neutralized_nodes", 0)
        ),
        finite_coverage_percent=float(worst["finite_coverage_percent"]),
    )


def _phase(
    output_dir: Path,
    phase: str,
    expected_layer_set: str,
) -> DemoPhase:
    route_file = output_dir / "routes" / "v3" / f"{phase}.json"
    document = json.loads(route_file.read_text(encoding="utf-8"))
    layer_set_id = document.get("layer_set_id", "")
    if layer_set_id != expected_layer_set:
        raise DemoValidationError(
            f"{phase} layer_set_id {layer_set_id} != expected {expected_layer_set}"
        )
    semantic = _document_semantic_digest(route_file)
    if layer_set_id != f"layer-set-sha256-{semantic}":
        raise DemoValidationError(f"{phase} semantic digest mismatch")
    routes: list[DemoRoute] = []
    for layer in document["layers"]:
        planning_layer = layer["planning_layer"]
        for objective, plan in layer["plans"].items():
            metrics = plan["metrics"]
            routes.append(
                DemoRoute(
                    planning_layer=planning_layer,
                    objective=objective,
                    waypoints=tuple(
                        {
                            "longitude": waypoint["longitude"],
                            "latitude": waypoint["latitude"],
                            "eta": waypoint["eta"],
                        }
                        for waypoint in plan["waypoints"]
                    ),
                    distance_km=float(metrics["distance_km"]),
                    eta_hours=float(metrics["eta_hours"]),
                    avg_risk=float(metrics["avg_risk"]),
                    max_risk=float(metrics["max_risk"]),
                    integrated_risk_hours=float(metrics["integrated_risk_hours"]),
                    minimum_confidence=float(metrics["minimum_confidence"]),
                    hard_constraint_violations=int(
                        metrics["hard_constraint_violations"]
                    ),
                    turn_count=int(metrics["turn_count"]),
                    objective_cost=float(metrics["objective_cost"]),
                    expanded_nodes=metrics.get("expanded_nodes"),
                )
            )
    return DemoPhase(phase=phase, layer_set_id=layer_set_id, routes=tuple(routes))


def _verify_against_rc1_golden(report: Mapping[str, Any], golden_path: Path) -> None:
    golden = json.loads(golden_path.read_text(encoding="utf-8"))
    ours = _business_payload(report)
    theirs = _business_payload(golden)
    if ours != theirs:
        raise DemoValidationError("Scenario A business payload differs from RC1 golden")


def _business_payload(report: Mapping[str, Any]) -> list[tuple[Any, ...]]:
    payload: list[tuple[Any, ...]] = []
    for phase in ("initial", "replanned"):
        for route in report["routes"][phase]:
            metrics = route["metrics"]
            payload.append(
                (
                    phase,
                    route["objective_mode"],
                    round(metrics["distance_km"], 6),
                    round(metrics["eta_hours"], 9),
                    round(metrics["avg_risk"], 12),
                    round(metrics["max_risk"], 12),
                    metrics["hard_constraint_violations"],
                    metrics["turn_count"],
                    round(metrics["objective_cost"], 12),
                )
            )
    return payload


def load_frozen_scenario(source: FrozenScenarioSource) -> DemoScenario:
    """Load one frozen v3 scenario and verify identity/checksums/digests."""

    output_dir = Path(source.output_dir)
    if not output_dir.is_dir():
        raise DemoValidationError(f"frozen output dir missing: {output_dir}")
    report = json.loads((output_dir / "run-report.json").read_text(encoding="utf-8"))
    if report.get("status") != "success":
        raise DemoValidationError("run-report status != success")
    if report.get("planning_contract") != "cd.four-layer-route-plan-set.v3":
        raise DemoValidationError("frozen artifact is not v3")
    identity = report["identity"]
    digests = report["digests"]
    try:
        run_context = json.loads(
            (output_dir / "run-context.json").read_text(encoding="utf-8")
        )
        scenario_mode = str(run_context.get("scenario_mode", ""))
        simulation_start = str(run_context.get("simulation_start", ""))
        simulation_end = str(run_context.get("simulation_end", ""))
    except (OSError, json.JSONDecodeError):
        scenario_mode = ""
        simulation_start = ""
        simulation_end = ""
    knowledge_as_of = str(identity.get("as_of_time", ""))
    expected = source.expected
    checks = {
        "scenario_id": (identity["scenario_id"], expected.get("scenario_id")),
        "corridor_id": (identity["corridor_id"], expected.get("corridor_id")),
        "run_id": (identity["run_id"], expected.get("run_id")),
        "bundle_id": (digests["dataset_bundle_id"], expected.get("bundle_id")),
    }
    mismatched = [
        name for name, (actual, wanted) in checks.items() if wanted and actual != wanted
    ]
    if mismatched:
        raise DemoValidationError(f"identity mismatch: {', '.join(mismatched)}")
    _check_checksums(output_dir)
    preflight = json.loads(
        (output_dir / "planning-coverage-preflight.json").read_text(encoding="utf-8")
    )
    if not preflight["gate_passed"]:
        raise DemoValidationError("coverage preflight gate failed")
    phases = (
        _phase(output_dir, "initial", expected["initial_layer_set"]),
        _phase(output_dir, "replanned", expected["replanned_layer_set"]),
    )
    if source.rc1_golden_run_report is not None:
        _verify_against_rc1_golden(report, Path(source.rc1_golden_run_report))
    spatial = (
        build_spatial(output_dir, source.risk_store_root)
        if source.risk_store_root
        else None
    )
    return DemoScenario(
        scenario_id=source.scenario_id,
        display_name=source.display_name,
        corridor_id=identity["corridor_id"],
        corridor_version=expected.get("corridor_version", ""),
        bundle_id=digests["dataset_bundle_id"],
        run_context_id=identity["run_id"],
        result_origin=ResultOrigin.FROZEN_VALIDATED,
        phases=phases,
        coverage=_coverage(preflight),
        source_dir=source.output_dir,
        scenario_mode=scenario_mode,
        simulation_start=simulation_start,
        simulation_end=simulation_end,
        knowledge_as_of=knowledge_as_of,
        notes=source.notes,
        spatial=spatial,
        phase_deltas=compute_phase_deltas(phases[0], phases[1]),
    )
