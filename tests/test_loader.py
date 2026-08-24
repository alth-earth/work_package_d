import json

import pytest

from arctic_route_display.loader import (
    DisplayValidationError,
    load_selection_rationale,
    load_v3_group,
)


def _document() -> dict:
    layer = {
        "plans": {
            "fastest": {"id": "f"},
            "low_risk": {"id": "l"},
            "recommended": {"id": "r"},
        }
    }
    return {
        "schema_version": "cd.four-layer-route-plan-set.v3",
        "layer_set_id": "set-1",
        "run_id": "run-1",
        "scenario_id": "scenario-1",
        "generation_id": 0,
        "input_revision": 0,
        "layers": {
            "full_voyage": layer,
            "main_corridor_24_72h": layer,
            "rolling_0_24h": layer,
            "executable_0_6h": layer,
        },
    }


def test_load_v3_group_groups_four_layers(tmp_path) -> None:
    path = tmp_path / "v3.json"
    path.write_text(json.dumps(_document()), encoding="utf-8")
    view = load_v3_group(path)
    assert view.is_complete
    assert view.route_count == 12
    assert {layer.layer_id for layer in view.layers} == {
        "full_voyage",
        "main_corridor_24_72h",
        "rolling_0_24h",
        "executable_0_6h",
    }


def test_load_v3_group_rejects_missing_layer(tmp_path) -> None:
    document = _document()
    del document["layers"]["rolling_0_24h"]
    path = tmp_path / "v3.json"
    path.write_text(json.dumps(document), encoding="utf-8")
    with pytest.raises(DisplayValidationError, match="four layers"):
        load_v3_group(path)


def test_load_v3_group_rejects_invalid_schema(tmp_path) -> None:
    path = tmp_path / "v3.json"
    path.write_text(json.dumps({"nope": True}), encoding="utf-8")
    schema = tmp_path / "schema.json"
    schema.write_text(
        json.dumps(
            {
                "type": "object",
                "required": ["layers"],
                "properties": {"layers": {"type": "object"}},
            }
        ),
        encoding="utf-8",
    )
    with pytest.raises(DisplayValidationError, match="schema errors"):
        load_v3_group(path, schema_path=schema)


def _rationale_document() -> dict:
    return {
        "schema_version": "selection-rationale.v1",
        "run_id": "run-1",
        "scenario_id": "scenario-1",
        "corridor_id": "corridor-1",
        "vessel_profile_id": "vessel-1",
        "config_digest": "a" * 64,
        "model_config_digest": "b" * 64,
        "planner_config_digest": "c" * 64,
        "provenance": "synthetic",
        "generation_id": 0,
        "planning_request_id": "request-1",
        "input_revision": 0,
        "selected_plan_id": "recommended-1",
        "baseline_plan_id": "fastest-1",
        "selected_objective": "recommended",
        "baseline_objective": "fastest",
        "tradeoffs": {
            "delta_distance_km": 0.4,
            "delta_eta_hours": 0.24,
            "delta_avg_risk": -0.01,
            "delta_max_risk": -0.001,
            "delta_integrated_risk_hours": -0.64,
            "avg_risk_reduction_pct": 2.96,
            "max_risk_reduction_pct": 0.14,
        },
        "summary_text": "推荐路线平均风险减少 3.0%",
    }


def test_load_selection_rationale_parses_document(tmp_path) -> None:
    path = tmp_path / "selection-rationale.json"
    path.write_text(json.dumps(_rationale_document()), encoding="utf-8")
    view = load_selection_rationale(path)
    assert view.schema_version == "selection-rationale.v1"
    assert view.selected_objective == "recommended"
    assert view.baseline_objective == "fastest"
    assert view.selected_plan_id == "recommended-1"
    assert view.baseline_plan_id == "fastest-1"
    assert view.tradeoffs.avg_risk_reduction_pct == 2.96
    assert view.tradeoffs.delta_eta_hours == 0.24
    assert "平均风险减少" in view.summary_text


def test_load_selection_rationale_rejects_wrong_schema_version(tmp_path) -> None:
    document = _rationale_document()
    document["schema_version"] = "selection-rationale.v0"
    path = tmp_path / "selection-rationale.json"
    path.write_text(json.dumps(document), encoding="utf-8")
    with pytest.raises(DisplayValidationError, match="schema_version mismatch"):
        load_selection_rationale(path)


def test_load_selection_rationale_rejects_invalid_schema(tmp_path) -> None:
    document = _rationale_document()
    document["baseline_objective"] = "low_risk"
    path = tmp_path / "selection-rationale.json"
    path.write_text(json.dumps(document), encoding="utf-8")
    schema = tmp_path / "schema.json"
    schema.write_text(
        json.dumps(
            {
                "type": "object",
                "required": ["schema_version", "tradeoffs"],
                "properties": {
                    "schema_version": {"const": "selection-rationale.v1"},
                    "tradeoffs": {"type": "object"},
                },
                "additionalProperties": False,
            }
        ),
        encoding="utf-8",
    )
    with pytest.raises(DisplayValidationError, match="schema errors"):
        load_selection_rationale(path, schema_path=schema)
