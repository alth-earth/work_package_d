import json
import shutil
import subprocess
from itertools import product
from pathlib import Path

import pytest

VIEWER = Path(__file__).resolve().parents[2] / "viewer"
VALIDATOR = VIEWER / "research_candidates.js"
WINTER_CANDIDATES = (
    Path(__file__).resolve().parents[3]
    / ".runtime/experiments/winter-c-validation-20260823-medium/route-candidates.json"
)

LAYERS = (
    "full_voyage",
    "main_corridor_24_72h",
    "rolling_0_24h",
    "executable_0_6h",
)
OBJECTIVES = ("fastest", "low_risk", "recommended")


def _candidate_document() -> dict:
    run_id = "run-441b03c8-d45b-5414-b0e8-b7fd0d990c22"
    layer_set_id = f"layer-set-sha256-{'a' * 64}"
    candidates = []
    for index, (layer, objective) in enumerate(product(LAYERS, OBJECTIVES)):
        candidate_id = f"route-v3-sha256-{index + 1:064x}"
        candidates.append(
            {
                "arrival_eta": "2026-02-17T05:00:00Z",
                "candidate_id": candidate_id,
                "distance_km": 900.0 + index,
                "geometry": {"coordinates": [[18.4, 70.3], [12.4, 78.0]], "type": "LineString"},
                "layer": layer,
                "objective": objective,
                "provenance": {
                    "config_digest": "b" * 64,
                    "corridor_id": "tromso_to_isfjorden_outer",
                    "generation_id": 0,
                    "input_revision": 0,
                    "model_config_digest": "c" * 64,
                    "planner_config_digest": "d" * 64,
                    "run_id": run_id,
                    "scenario_id": "tromso_isfjorden_february_2026_research_v1",
                    "source_plan_id": candidate_id,
                    "source_risk_ids": [f"risk-sha256-{'e' * 64}"],
                    "source_schema": "cd.route-plan.v3",
                    "vessel_profile_id": "nordic_odyssey_reference_v1",
                },
                "risk_metrics": {
                    "average_risk": 0.1,
                    "hard_violation_count": 0,
                    "integrated_risk_hours": 5.0,
                    "maximum_risk": 0.2,
                    "minimum_confidence": 0.67,
                },
                "travel_hours": 53.0 + index / 10,
            }
        )
    return {
        "candidate_set_id": f"route-candidates-sha256-{'f' * 64}",
        "candidates": candidates,
        "decision_time": "2026-02-15T00:00:00Z",
        "layer_set_id": layer_set_id,
        "provenance": {
            "projection_owner": "arctic_route_orchestrator",
            "source_generation_id": 0,
            "source_input_revision": 0,
            "source_layer_set_id": layer_set_id,
            "source_run_id": run_id,
            "source_schema": "cd.four-layer-route-plan-set.v3",
        },
        "schema_version": "presentation.route-candidates.v1",
        "selected_candidate_id": candidates[2]["candidate_id"],
        "status": "PUBLISHED",
    }


def _inspect_with_node(document: dict, scenario_id: str | None) -> dict:
    node = shutil.which("node")
    if node is None:
        pytest.skip("node not available")
    script = """
const fs = require("fs");
const api = require(process.argv[1]);
const input = JSON.parse(fs.readFileSync(0, "utf8"));
process.stdout.write(JSON.stringify(api.inspect(input.document, input.scenario_id)));
"""
    result = subprocess.run(
        [node, "-e", script, str(VALIDATOR)],
        input=json.dumps({"document": document, "scenario_id": scenario_id}),
        capture_output=True,
        check=True,
        text=True,
    )
    return json.loads(result.stdout)


def test_viewer_consumes_published_candidate_identity_and_canonical_risk_metrics() -> None:
    script = (VIEWER / "app.js").read_text(encoding="utf-8")
    validator = VALIDATOR.read_text(encoding="utf-8")

    assert "selected_candidate_id" in script
    assert "metrics.average_risk" in script
    assert "metrics.maximum_risk" in script
    assert "metrics.integrated_risk_hours" in script
    assert 'selected?.layer !== "full_voyage"' in validator
    assert 'selected?.objective !== "recommended"' in validator
    assert "validCandidateProvenance" in validator
    assert "validRiskMetrics" in validator


def test_research_mode_requires_atomic_four_by_three_publication() -> None:
    script = (VIEWER / "app.js").read_text(encoding="utf-8")
    validator = VALIDATOR.read_text(encoding="utf-8")
    html = (VIEWER / "index.html").read_text(encoding="utf-8")

    assert 'value="research"' in html
    assert 'id="route-layer"' in html
    assert 'id="experiment-metadata"' in html
    assert 'id="route-candidates"' in html
    assert 'value="full_voyage"' in html
    assert 'value="main_corridor_24_72h"' in html
    assert 'value="rolling_0_24h"' in html
    assert 'value="executable_0_6h"' in html
    assert "value.candidates.length !== ROUTE_LAYERS.length * ROUTE_OBJECTIVES.length" in validator
    assert "candidateGeometryPoints(candidate)" in script
    assert "drawResearchCandidateRoutes()" in script


def test_candidate_display_preserves_source_order_and_fallback() -> None:
    script = (VIEWER / "app.js").read_text(encoding="utf-8")
    validator = VALIDATOR.read_text(encoding="utf-8")
    update_start = script.index("function updateResearchPanel()")
    draw_start = script.index("function drawRiskFrame", update_start)
    research_panel = script[update_start:draw_start]

    assert ".sort(" not in research_panel
    assert "SINGLE_ROUTE_FALLBACK" in script
    assert "Existing authoritative replay remains active" in script
    assert "candidate scenario does not match the Viewer bundle" in validator
    assert "display-only comparison selection" in script


def test_candidate_validator_accepts_complete_atomic_package() -> None:
    document = _candidate_document()
    result = _inspect_with_node(document, document["candidates"][0]["provenance"]["scenario_id"])

    assert result["valid"] is True
    assert result["reason"] is None
    assert len(result["candidates"]) == 12


@pytest.mark.parametrize(
    "mutation",
    [
        lambda value: value["candidates"].__setitem__(slice(11, None), []),
        lambda value: value["candidates"][0].__setitem__("distance_km", None),
        lambda value: value["candidates"][0]["risk_metrics"].__setitem__("average_risk", "0.1"),
        lambda value: value["candidates"][0]["risk_metrics"].pop("minimum_confidence"),
        lambda value: value["candidates"][0]["risk_metrics"].__setitem__("hard_violation_count", 1),
        lambda value: value["candidates"][0]["provenance"].__setitem__("source_plan_id", "wrong"),
        lambda value: value.__setitem__("unexpected", True),
    ],
)
def test_candidate_validator_fails_closed_on_malformed_values(mutation) -> None:
    document = _candidate_document()
    mutation(document)

    result = _inspect_with_node(document, "tromso_isfjorden_february_2026_research_v1")

    assert result["valid"] is False
    assert result["candidates"] == []


def test_candidate_validator_rejects_scenario_mismatch() -> None:
    result = _inspect_with_node(_candidate_document(), "different_scenario")

    assert result == {
        "valid": False,
        "reason": "candidate scenario does not match the Viewer bundle",
        "candidates": [],
    }


def test_current_not_published_bundle_keeps_single_route_fallback() -> None:
    bundle = json.loads((VIEWER / "bundle.json").read_text(encoding="utf-8"))
    result = _inspect_with_node(bundle["route_candidates"], bundle["replay"]["scenario_id"])

    assert result == {
        "valid": False,
        "reason": "candidate_geometry_and_metrics_not_published",
        "candidates": [],
    }


def test_real_winter_candidate_artifact_has_three_objectives_per_layer() -> None:
    if not WINTER_CANDIDATES.exists():
        pytest.skip("real Winter C presentation artifact is not available in this checkout")

    document = json.loads(WINTER_CANDIDATES.read_text(encoding="utf-8"))
    assert document["schema_version"] == "presentation.route-candidates.v1"
    assert document["status"] == "PUBLISHED"
    assert len(document["candidates"]) == 12
    assert {
        (candidate["layer"], candidate["objective"])
        for candidate in document["candidates"]
    } == {
        (layer, objective)
        for layer in LAYERS
        for objective in OBJECTIVES
    }
    selected = next(
        candidate
        for candidate in document["candidates"]
        if candidate["candidate_id"] == document["selected_candidate_id"]
    )
    assert selected["layer"] == "full_voyage"
    assert selected["objective"] == "recommended"
    assert selected["distance_km"] == pytest.approx(921.3795600787913, abs=1e-12)
    assert selected["travel_hours"] == pytest.approx(53.40558083988698, abs=1e-12)
    assert selected["risk_metrics"]["average_risk"] == pytest.approx(
        0.10565119019764452, abs=1e-12
    )
    assert _inspect_with_node(
        document, "tromso_isfjorden_february_2026_research_v1"
    )["valid"] is True
