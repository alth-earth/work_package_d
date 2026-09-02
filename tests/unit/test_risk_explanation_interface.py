"""Fail-closed D consumer checks for the optional risk-explanation.v1 sidecar."""

from __future__ import annotations

import copy
import json
import shutil
import subprocess
from pathlib import Path

import pytest

VIEWER = Path(__file__).resolve().parents[2] / "viewer"
VALIDATOR = VIEWER / "risk_explanation.js"
RUN_ID = "run-441b03c8-d45b-5414-b0e8-b7fd0d990c22"
SCENARIO_ID = "tromso_isfjorden_february_2026_research_v1"
RISK_WINDOW_ID = f"risk-window-sha256-{'a' * 64}"
RISK_FRAME_ID = f"risk-sha256-{'b' * 64}"


def _bundle() -> dict:
    return {
        "risk": {
            "source": {
                "schema_version": "bc.risk-frame.v2",
                "risk_window_id": RISK_WINDOW_ID,
                "run_id": RUN_ID,
                "scenario_id": SCENARIO_ID,
            },
            "grid": {"rows": 1, "cols": 3},
            "frames": [
                {
                    "risk_id": RISK_FRAME_ID,
                    "valid_time": "2026-02-15T00:00:00Z",
                    "coordinates": {
                        "latitude": [72.25],
                        "longitude": [55.75, 56.25, 56.75],
                    },
                    "risk_scores": [0.32, 0.2, 0.1],
                    "risk_levels": [2, 2, 1],
                    "confidences": [0.8, 0.7, 0.6],
                }
            ],
        }
    }


def _cell(column: int, *, status: str = "COMPLETE") -> dict:
    score = [0.32, 0.2, 0.1][column]
    level = [2, 2, 1][column]
    confidence = [0.8, 0.7, 0.6][column]
    if status == "PARTIAL":
        contributors = [
            {
                "contributor_id": "ice",
                "display_name": "Ice concentration",
                "contribution": 0.12,
                "component_ids": ["ice_concentration"],
            }
        ]
        reason = {
            "code": "PARTIAL_EXPLANATION",
            "text": "Only the published ice contribution is available",
            "locale": "en",
            "main_contributor_ids": ["ice"],
        }
        uncertainty = {
            "status": "EXPLANATION_GAP",
            "missing_data": [],
            "explanation_gaps": ["wave_height", "wind_speed"],
        }
    else:
        contributors = [
            {
                "contributor_id": "ice",
                "display_name": "Ice concentration",
                "contribution": score * 0.5,
                "component_ids": ["ice_concentration"],
            },
            {
                "contributor_id": "wave",
                "display_name": "Wave",
                "contribution": score * 0.3,
                "component_ids": ["wave_height"],
            },
            {
                "contributor_id": "wind",
                "display_name": "Wind",
                "contribution": score * 0.2,
                "component_ids": ["wind_speed"],
            },
        ]
        reason = {
            "code": "MULTIPLE_CONTRIBUTORS",
            "text": "Published ice, wave, and wind contributions",
            "locale": "en",
            "main_contributor_ids": ["ice", "wave", "wind"],
        }
        uncertainty = {"status": "NONE", "missing_data": [], "explanation_gaps": []}
    return {
        "cell": {
            "row_index": 0,
            "column_index": column,
            "latitude": 72.25,
            "longitude": [55.75, 56.25, 56.75][column],
        },
        "explanation_status": status,
        "risk": {"score": score, "level": level, "confidence": confidence},
        "contributors": contributors,
        "reason": reason,
        "uncertainty": uncertainty,
    }


def _sidecar(*, status: str = "COMPLETE") -> dict:
    cells = (
        [_cell(index) for index in range(3)]
        if status == "COMPLETE"
        else [_cell(0, status="PARTIAL")]
    )
    return {
        "schema_version": "risk-explanation.v1",
        "publication_status": status,
        "identity": {
            "risk_window_id": RISK_WINDOW_ID,
            "run_id": RUN_ID,
            "scenario_id": SCENARIO_ID,
            "corridor_id": "tromso_to_isfjorden_outer",
            "vessel_profile_id": "nordic_odyssey_reference_v1",
            "config_digest": "c" * 64,
            "model_config_digest": "d" * 64,
            "generation_id": 0,
            "as_of_time": "2026-02-15T00:00:00Z",
        },
        "producer": {
            "producer_id": "work_package_b-test-fixture",
            "generated_at": "2026-02-15T00:00:00Z",
            "formula_version": "test_fixture_v1",
            "formula_component_ids": ["ice_concentration", "wave_height", "wind_speed"],
            "decomposition_method": "weighted_additive_decomposition_v1",
            "calibration_status": "demo_unvalidated",
            "source_risk_provenance": "synthetic",
            "sidecar_maturity": "design_example",
        },
        "frames": [
            {
                "risk_frame_id": RISK_FRAME_ID,
                "frame_time": "2026-02-15T00:00:00Z",
                "grid": {"grid_id": "test-grid", "crs": "EPSG:4326", "rows": 1, "columns": 3},
                "coverage": {
                    "expected_cell_count": 3,
                    "published_cell_count": len(cells),
                    "complete_cell_count": 3 if status == "COMPLETE" else 0,
                    "partial_cell_count": 1 if status == "PARTIAL" else 0,
                    "unavailable_cell_count": 0,
                    "omitted_cell_count": 0 if status == "COMPLETE" else 2,
                },
                "cells": cells,
            }
        ],
    }


def _inspect(sidecar: dict | None, bundle: dict | None = None) -> dict:
    node = shutil.which("node")
    if node is None:
        pytest.skip("node not available")
    script = """
const fs = require("fs");
const api = require(process.argv[1]);
const input = JSON.parse(fs.readFileSync(0, "utf8"));
process.stdout.write(JSON.stringify(api.inspect(input.sidecar, input.bundle)));
"""
    result = subprocess.run(
        [node, "-e", script, str(VALIDATOR)],
        input=json.dumps({"sidecar": sidecar, "bundle": bundle or _bundle()}),
        capture_output=True,
        check=True,
        text=True,
    )
    return json.loads(result.stdout)


def test_missing_sidecar_keeps_explanation_unavailable() -> None:
    bundle = _bundle()
    before = copy.deepcopy(bundle)
    result = _inspect(None, bundle)

    assert result == {
        "valid": False,
        "mode": "missing",
        "reason": "risk explanation sidecar is absent",
        "publication_status": "UNAVAILABLE",
        "cells": {},
    }
    assert bundle == before


@pytest.mark.parametrize(
    ("mutation", "reason"),
    [
        (
            lambda value: value.__setitem__("schema_version", "risk-explanation.v0"),
            "schema_version",
        ),
        (
            lambda value: value["identity"].__setitem__(
                "risk_window_id", f"risk-window-sha256-{'e' * 64}"
            ),
            "RiskWindow",
        ),
        (
            lambda value: value["frames"][0].__setitem__(
                "risk_frame_id", f"risk-sha256-{'f' * 64}"
            ),
            "RiskFrame",
        ),
        (lambda value: value["frames"][0]["grid"].__setitem__("rows", 2), "grid"),
        (
            lambda value: value["frames"][0]["cells"][0]["cell"].__setitem__(
                "longitude", 0.0
            ),
            "coordinate",
        ),
        (
            lambda value: value["frames"][0]["cells"][0]["contributors"][0].__setitem__(
                "contribution", 0.0
            ),
            "COMPLETE",
        ),
        (
            lambda value: value["identity"].__setitem__("scenario_id", "invalid scenario"),
            "identity",
        ),
        (
            lambda value: value["identity"].__setitem__(
                "as_of_time", "2026-02-15 00:00:00Z"
            ),
            "identity",
        ),
    ],
)
def test_invalid_sidecar_is_rejected_without_touching_base_risk(mutation, reason: str) -> None:
    sidecar = _sidecar()
    mutation(sidecar)

    result = _inspect(sidecar)

    assert result["valid"] is False
    assert result["publication_status"] == "UNAVAILABLE"
    assert reason in result["reason"]
    assert _bundle()["risk"]["frames"][0]["risk_scores"] == [0.32, 0.2, 0.1]


def test_partial_sidecar_preserves_only_producer_fields_and_source_order() -> None:
    result = _inspect(_sidecar(status="PARTIAL"))
    cell = result["cells"][f"{RISK_FRAME_ID}|0|0"]

    assert result["valid"] is True
    assert result["publication_status"] == "PARTIAL"
    assert cell["explanation_status"] == "PARTIAL"
    assert [item["contributor_id"] for item in cell["contributors"]] == ["ice"]
    assert "wave" not in {item["contributor_id"] for item in cell["contributors"]}
    assert "wind" not in {item["contributor_id"] for item in cell["contributors"]}


def test_complete_sidecar_exposes_contributors_reason_and_uncertainty() -> None:
    result = _inspect(_sidecar())
    cell = result["cells"][f"{RISK_FRAME_ID}|0|0"]

    assert result["valid"] is True
    assert result["publication_status"] == "COMPLETE"
    assert [item["display_name"] for item in cell["contributors"]] == [
        "Ice concentration",
        "Wave",
        "Wind",
    ]
    assert cell["reason"]["text"] == "Published ice, wave, and wind contributions"
    assert cell["uncertainty"] == {
        "status": "NONE",
        "missing_data": [],
        "explanation_gaps": [],
    }


def test_complete_publication_must_cover_the_displayed_riskwindow_frames() -> None:
    bundle = _bundle()
    second_frame = copy.deepcopy(bundle["risk"]["frames"][0])
    second_frame["risk_id"] = f"risk-sha256-{'e' * 64}"
    second_frame["valid_time"] = "2026-02-15T01:00:00Z"
    bundle["risk"]["frames"].append(second_frame)

    result = _inspect(_sidecar(), bundle)

    assert result["valid"] is False
    assert result["reason"] == (
        "COMPLETE publication contradicts RiskWindow frame or cell coverage"
    )


def test_viewer_renders_riskframe_values_and_does_not_sort_or_synthesize() -> None:
    html = (VIEWER / "index.html").read_text(encoding="utf-8")
    script = (VIEWER / "app.js").read_text(encoding="utf-8")
    render = script[
        script.index("function renderRiskExplanation") : script.index("function objectiveLabel")
    ]

    assert 'id="risk-explanation-status"' in html
    assert 'id="risk-explanation-contributor-list"' in html
    assert 'src="risk_explanation.js"' in html
    assert "snapshot.risk_level" in render
    assert "snapshot.risk_score" in render
    assert "snapshot.confidence" in render
    assert "explanation.reason.text" in render
    assert "explanation.uncertainty.status" in render
    assert ".sort(" not in render
    assert "contributor.contribution || 0" not in render


def test_offline_embed_includes_the_sidecar_validator() -> None:
    embed = (VIEWER / "embed.py").read_text(encoding="utf-8")

    assert 'viewer / "risk_explanation.js"' in embed
    assert '<script src="risk_explanation.js"></script>' in embed
