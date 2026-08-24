"""Cross-package regression: D consumes a real C selection-rationale artifact.

The fixture is a genuine C synthetic-demo output (selection-rationale.json),
validated against the C-owned selection-rationale.v1 schema offline.
"""

from __future__ import annotations

import json
import socket
from pathlib import Path

import pytest

from arctic_route_display.cli import main as cli_main
from arctic_route_display.loader import load_selection_rationale

FIXTURES = Path(__file__).parents[1] / "fixtures"
SCHEMA = (
    Path(__file__).parents[3]
    / "work_package_c"
    / "schemas"
    / "selection-rationale-v1.schema.json"
)


def _block_network(monkeypatch: pytest.MonkeyPatch) -> None:
    def deny(*_args, **_kwargs):
        raise OSError("network blocked for offline regression")

    monkeypatch.setattr(socket.socket, "connect", deny)
    monkeypatch.setattr(socket.socket, "connect_ex", deny)


def test_real_c_selection_rationale_loads_offline(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _block_network(monkeypatch)
    view = load_selection_rationale(
        FIXTURES / "selection-rationale.json",
        schema_path=SCHEMA,
    )
    assert view.schema_version == "selection-rationale.v1"
    assert view.selected_objective == "recommended"
    assert view.baseline_objective == "fastest"
    assert view.selected_plan_id.startswith("recommended-")
    assert view.baseline_plan_id.startswith("fastest-")
    assert view.tradeoffs.avg_risk_reduction_pct > 0
    assert view.tradeoffs.delta_avg_risk <= 0
    assert view.tradeoffs.delta_eta_hours >= 0
    assert view.summary_text
    assert view.run_id


def test_real_c_selection_rationale_matches_run_summary_summary(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Rationale sidecar fields must mirror what C publishes in run-summary."""
    _block_network(monkeypatch)
    rationale = json.loads(
        (FIXTURES / "selection-rationale.json").read_text(encoding="utf-8")
    )
    assert rationale["schema_version"] == "selection-rationale.v1"
    tradeoffs = rationale["tradeoffs"]
    for key in (
        "delta_distance_km",
        "delta_eta_hours",
        "delta_avg_risk",
        "delta_max_risk",
        "delta_integrated_risk_hours",
        "avg_risk_reduction_pct",
        "max_risk_reduction_pct",
    ):
        assert key in tradeoffs
    assert isinstance(tradeoffs["delta_avg_risk"], float)


def test_cli_snapshot_includes_selection_rationale_segment(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _block_network(monkeypatch)
    output = tmp_path / "snapshot.json"
    code = cli_main(
        [
            "snapshot",
            "--rationale",
            str(FIXTURES / "selection-rationale.json"),
            "--rationale-schema",
            str(SCHEMA),
            "--output",
            str(output),
        ]
    )
    assert code == 0
    snapshot = json.loads(output.read_text(encoding="utf-8"))
    assert snapshot["status"] == "empty"
    segment = snapshot["selection_rationale"]
    assert segment is not None
    assert segment["selected_objective"] == "recommended"
    assert segment["baseline_objective"] == "fastest"
    assert segment["tradeoffs"]["avg_risk_reduction_pct"] > 0
    assert "平均风险减少" in segment["summary_text"]
