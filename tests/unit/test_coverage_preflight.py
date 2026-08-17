"""D-side consumption of the orchestrator planning coverage preflight."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from arctic_route_display.cli import main
from arctic_route_display.loader import (
    DisplayValidationError,
    load_coverage_preflight,
)

FIXTURE = Path(__file__).parents[1] / "fixtures" / "planning-coverage-preflight.json"
SCHEMA = (
    Path(__file__).parents[3]
    / "arctic_route_orchestrator"
    / "schemas"
    / "planning-coverage-preflight-v1.schema.json"
)


def test_load_coverage_preflight_from_fixture() -> None:
    view = load_coverage_preflight(FIXTURE, schema_path=SCHEMA)
    assert view.schema_version == "orchestrator.planning-coverage-preflight.v1"
    assert view.gate_passed is True
    assert view.frames_expected == 73
    assert view.frames_checked == 73
    assert view.total_nodes == 90
    assert view.land_nodes == 3
    assert view.data_unavailable_nodes == 2
    assert view.ice_free_neutralized_nodes == 3
    assert view.worst_frame is not None
    assert len(view.frames) == 1


def test_load_coverage_preflight_rejects_unknown_fields(tmp_path: Path) -> None:
    document = json.loads(FIXTURE.read_text(encoding="utf-8"))
    document["unexpected"] = True
    path = tmp_path / "preflight.json"
    path.write_text(json.dumps(document), encoding="utf-8")
    with pytest.raises(DisplayValidationError, match="schema errors"):
        load_coverage_preflight(path, schema_path=SCHEMA)


def test_cli_coverage_subcommand_prints_summary(capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["coverage", str(FIXTURE), "--schema", str(SCHEMA)]) == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload["ok"] is True
    assert payload["gate_passed"] is True
    assert payload["run_id"] == "run-00000000-0000-4000-8000-0000000c0002"
    assert payload["data_unavailable_nodes"] == 2
    assert payload["ice_free_neutralized_nodes"] == 3
    assert payload["other_hard_nodes"] == 0
    assert payload["hard_nodes"] == 5
    assert payload["planning_available_nodes"] == 85
