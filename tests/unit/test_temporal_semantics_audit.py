"""Temporal semantics audit regression against real frozen artifacts."""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from arctic_route_display.demo.temporal_audit import audit_frozen_config


def _workspace_root() -> Path:
    env = os.environ.get("ARCTIC_ROUTE_ROOT")
    if env and Path(env).is_dir():
        return Path(env)
    for parent in Path(__file__).resolve().parents:
        if (parent / "arctic_route_contracts").is_dir():
            return parent
    return Path.home()


CONFIG = _workspace_root() / "work_package_d" / "configs" / "demo_frozen_sources.json"
MUR_OUT = _workspace_root() / "work_package_a" / "data" / "output" / "rc2-smoke" / "output-mur-opt"
TROMSO_OUT = _workspace_root() / "work_package_a" / "data" / "output" / "rc2-smoke" / "output-tromso-144h-r2"


@pytest.mark.skipif(
    not MUR_OUT.is_dir() or not TROMSO_OUT.is_dir(),
    reason="frozen RC2 outputs not present",
)
def test_frozen_temporal_semantics_pass() -> None:
    report = audit_frozen_config(CONFIG)
    assert report["overall_status"] == "PASS"
    assert len(report["scenarios"]) == 2
    for scenario in report["scenarios"]:
        assert scenario["scenario_mode"] == "retrospective_best_estimate"
        assert scenario["risk_frame_count"] == 145
        assert len(scenario["distinct_risk_as_of"]) == 1
        assert len(scenario["distinct_risk_generated_at"]) == 1
        assert scenario["knowledge_as_of"] == scenario["distinct_risk_as_of"][0]
        assert scenario["route_as_of_initial"] == scenario["knowledge_as_of"]
        assert scenario["route_as_of_replanned"] == scenario["knowledge_as_of"]
        assert scenario["route_start_initial"] == scenario["simulation_start"]
        assert scenario["route_start_replanned"] == scenario["replan_trigger_time"]
        assert scenario["suffix_start"] == scenario["replan_trigger_time"]
        assert scenario["valid_time_hourly"] is True


@pytest.mark.skipif(
    not MUR_OUT.is_dir(),
    reason="frozen RC2 outputs not present",
)
def test_replan_is_same_knowledge_slice() -> None:
    """Regression: the +6h replan reuses the same knowledge snapshot."""

    report = audit_frozen_config(CONFIG)
    mur = next(s for s in report["scenarios"] if s["scenario_id"].startswith("murmansk"))
    assert mur["route_as_of_replanned"] == mur["knowledge_as_of"]
    assert mur["suffix_start"] == mur["replan_trigger_time"]
