"""Regression: D must consume the real RC1 v3 artifacts offline."""

from __future__ import annotations

import socket
from pathlib import Path

import pytest

from arctic_route_display.loader import load_v3_group

FIXTURES = Path(__file__).parents[1] / "fixtures"
SCHEMA = (
    Path(__file__).parents[3]
    / "work_package_c"
    / "schemas"
    / "four-layer-route-plan-set-v3.schema.json"
)


def _block_network(monkeypatch: pytest.MonkeyPatch) -> None:
    def deny(*_args, **_kwargs):
        raise OSError("network blocked for offline regression")

    monkeypatch.setattr(socket.socket, "connect", deny)
    monkeypatch.setattr(socket.socket, "connect_ex", deny)


@pytest.mark.parametrize("name", ["v3_initial_rc1.json", "v3_replanned_rc1.json"])
def test_real_v3_artifact_loads_offline(monkeypatch: pytest.MonkeyPatch, name: str) -> None:
    _block_network(monkeypatch)
    view = load_v3_group(FIXTURES / name, schema_path=SCHEMA)
    assert view.schema_version == "cd.four-layer-route-plan-set.v3"
    assert len(view.layers) == 4
    assert {layer.layer_id for layer in view.layers} == {
        "full_voyage",
        "main_corridor_24_72h",
        "rolling_0_24h",
        "executable_0_6h",
    }
    for layer in view.layers:
        assert layer.objectives == ("fastest", "low_risk", "recommended")
        for plan in layer.plans:
            assert plan.get("waypoints")
            assert plan.get("metrics", {}).get("distance_km") is not None
    assert view.group_id.startswith("layer-set-sha256-")
    assert view.scenario_id == "murmansk_dikson_august_2026_demo_v1"
    assert view.run_id == "run-00000000-0000-4000-8000-0000000b0005"


def test_initial_and_replanned_are_distinguishable() -> None:
    initial = load_v3_group(FIXTURES / "v3_initial_rc1.json", schema_path=SCHEMA)
    replanned = load_v3_group(FIXTURES / "v3_replanned_rc1.json", schema_path=SCHEMA)
    assert initial.group_id != replanned.group_id
    assert initial.input_revision == 0
    assert replanned.input_revision == 1
