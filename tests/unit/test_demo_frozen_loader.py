"""Demo adapter tests: frozen identity, live loader, preflight."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from arctic_route_display.demo.frozen_loader import (
    DemoValidationError,
    FrozenScenarioSource,
    load_frozen_scenario,
)
from arctic_route_display.demo.live_loader import load_live_result
from arctic_route_display.demo.models import ResultOrigin
from arctic_route_display.demo.preflight import run_preflight

CONFIG = Path("/root/my_project/work_package_d/configs/demo_frozen_sources.json")
TROMSO_OUT = Path(
    "/root/my_project/work_package_a/data/output/rc2-smoke/output-tromso-144h-r2"
)
TROMSO_STORE = Path(
    "/root/my_project/work_package_a/data/output/rc2-smoke/risk-store-tromso-144h-r2"
)
REQUIRED = {
    "scenario_id": "tromso_isfjorden_august_2026_demo_v1",
    "corridor_id": "tromso_to_isfjorden_outer",
    "corridor_version": "1.2.0",
    "bundle_id": "a-bundle-e1e3365fdf9922dcaad0b79e",
    "run_id": "run-00000000-0000-4000-8000-0000000a0006",
    "initial_layer_set": (
        "layer-set-sha256-e135e32d8a95dc7fb07ac536cc44c0ce455713355d970cf8a691962bbe3ec51f"
    ),
    "replanned_layer_set": (
        "layer-set-sha256-6e101345c48fda47cd4f77a3e39c00000a5c205bff29782488bfe80359717f42"
    ),
}


def _source(output_dir: str | None = None, **overrides) -> FrozenScenarioSource:
    values = dict(REQUIRED)
    values.update(overrides)
    return FrozenScenarioSource(
        scenario_id=values["scenario_id"],
        display_name="Tromsø → Isfjorden (test)",
        output_dir=output_dir or str(TROMSO_OUT),
        expected=values,
        risk_store_root=str(TROMSO_STORE) if TROMSO_STORE.is_dir() else None,
    )


@pytest.mark.skipif(
    not TROMSO_OUT.is_dir() or not TROMSO_STORE.is_dir(),
    reason="frozen RC2 outputs not present",
)
def test_frozen_scenario_b_loads_with_identity() -> None:
    scenario = load_frozen_scenario(
        _source(output_dir=str(TROMSO_OUT))
    )
    assert scenario.result_origin == ResultOrigin.FROZEN_VALIDATED
    assert len(scenario.phases) == 2
    for phase in scenario.phases:
        assert len(phase.routes) == 12
        assert {route.objective for route in phase.routes} == {
            "fastest",
            "low_risk",
            "recommended",
        }
    assert scenario.coverage.gate_passed is True
    assert scenario.coverage.ice_free_neutralized_nodes == 57
    assert scenario.scenario_mode == "retrospective_best_estimate"
    assert scenario.simulation_start == "2026-08-11T06:00:00Z"
    assert scenario.simulation_end == "2026-08-17T06:00:00Z"
    assert scenario.knowledge_as_of == "2026-08-15T09:37:34.830829Z"
    assert scenario.spatial is not None
    assert len(scenario.spatial.frames) == 2
    assert len(scenario.spatial.frames[0].longitudes) == 341
    assert len(scenario.phase_deltas) == 12
    recommended = next(
        delta
        for delta in scenario.phase_deltas
        if delta.planning_layer == "full_voyage" and delta.objective == "recommended"
    )
    assert isinstance(recommended.route_changed, bool)


@pytest.mark.skipif(not TROMSO_OUT.is_dir(), reason="frozen RC2 outputs not present")
def test_frozen_identity_mismatch_is_rejected() -> None:
    bad = _source(
        output_dir=str(TROMSO_OUT),
        initial_layer_set="layer-set-sha256-" + "0" * 64,
    )
    with pytest.raises(DemoValidationError, match="layer_set_id"):
        load_frozen_scenario(bad)


def test_missing_frozen_artifact_is_rejected(tmp_path: Path) -> None:
    with pytest.raises(DemoValidationError, match="missing"):
        load_frozen_scenario(_source(output_dir=str(tmp_path / "nope")))


def test_live_result_loader_marks_live_and_rejects_timeout(tmp_path: Path) -> None:
    doc = {
        "schema_version": "d.live-result.v1",
        "result_origin": "LIVE_COMPUTED",
        "scenario_id": "tromso_isfjorden_rc2_smoke_v1",
        "corridor_id": "tromso_to_isfjorden_outer",
        "run_id": "run-00000000-0000-4000-8000-0000000d0001",
        "objective": "recommended",
        "waypoints": [{"longitude": 18.0, "latitude": 70.5, "eta": "2026-08-11T12:00:00Z"}],
        "metrics": {
            "distance_km": 800.0,
            "eta_hours": 45.0,
            "avg_risk": 0.09,
            "max_risk": 0.18,
            "integrated_risk_hours": 4.0,
            "minimum_confidence": 0.5,
            "hard_constraint_violations": 0,
            "turn_count": 5,
            "objective_cost": 55.0,
            "expanded_states": 12345,
        },
    }
    path = tmp_path / "live.json"
    path.write_text(json.dumps(doc), encoding="utf-8")
    scenario = load_live_result(path)
    assert scenario.result_origin == ResultOrigin.LIVE_COMPUTED
    assert scenario.phases[0].phase == "replanned"
    assert scenario.phases[0].routes[0].expanded_nodes == 12345

    doc["status"] = "TIMEOUT"
    doc["message"] = "live replanning exceeded the demo timeout"
    path.write_text(json.dumps(doc), encoding="utf-8")
    with pytest.raises(DemoValidationError, match="TIMEOUT"):
        load_live_result(path)


@pytest.mark.skipif(
    not TROMSO_OUT.is_dir() or not CONFIG.is_file(),
    reason="frozen RC2 outputs not present",
)
def test_preflight_real_config_passes() -> None:
    rows = run_preflight(CONFIG, port=8124)
    assert all(row["status"] == "PASS" for row in rows)
    assert rows[-1]["check"].startswith("Port")
