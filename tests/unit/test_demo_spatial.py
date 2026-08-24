"""Spatial presentation adapter tests against real committed risk frames."""

from __future__ import annotations

import os
from collections import Counter
from pathlib import Path

import pytest

from arctic_route_display.demo.errors import DemoValidationError
from arctic_route_display.demo.spatial import build_spatial, load_risk_frame


def _workspace_root() -> Path:
    env = os.environ.get("ARCTIC_ROUTE_ROOT")
    if env and Path(env).is_dir():
        return Path(env)
    for parent in Path(__file__).resolve().parents:
        if (parent / "arctic_route_contracts").is_dir():
            return parent
    return Path.home()


MUR_OUT = _workspace_root() / "work_package_a" / "data" / "output" / "rc2-smoke" / "output-mur-opt"
MUR_STORE = _workspace_root() / "work_package_a" / "data" / "output" / "rc2-smoke" / "risk-store-mur-opt"
TROMSO_OUT = _workspace_root() / "work_package_a" / "data" / "output" / "rc2-smoke" / "output-tromso-144h-r2"
TROMSO_STORE = _workspace_root() / "work_package_a" / "data" / "output" / "rc2-smoke" / "risk-store-tromso-144h-r2"


@pytest.mark.skipif(
    not TROMSO_OUT.is_dir() or not TROMSO_STORE.is_dir(),
    reason="frozen RC2 outputs not present",
)
def test_tromso_spatial_matches_coverage_counts() -> None:
    spatial = build_spatial(TROMSO_OUT, TROMSO_STORE)
    assert len(spatial.frames) == 2
    assert spatial.frames[0].frame_index == 0
    assert spatial.frames[1].frame_index == 6
    frame = spatial.frames[0]
    assert len(frame.longitudes) == len(frame.latitudes) == 341
    assert len(frame.hard_reasons) == 341
    counts = Counter(frame.hard_reasons)
    assert counts["LAND"] == 65
    assert counts["DATA_UNAVAILABLE"] == 21
    assert counts["NONE"] == 255
    assert sum(frame.available) == 255
    assert all(level in (0, 1, 2, 3, 4, 5) for level in frame.risk_levels)


@pytest.mark.skipif(
    not MUR_OUT.is_dir() or not MUR_STORE.is_dir(),
    reason="frozen RC1 outputs not present",
)
def test_murmansk_spatial_matches_coverage_counts() -> None:
    spatial = build_spatial(MUR_OUT, MUR_STORE)
    frame = spatial.frames[0]
    assert len(frame.longitudes) == 396
    counts = Counter(frame.hard_reasons)
    assert counts["LAND"] == 144
    assert counts["DATA_UNAVAILABLE"] == 31
    assert counts["NONE"] == 221


def test_load_risk_frame_rejects_identity_mismatch(tmp_path: Path) -> None:
    (tmp_path / "frames").mkdir()
    (tmp_path / "frames" / "risk-sha256-000.json").write_text(
        '{"risk_id": "risk-sha256-111"}',
        encoding="utf-8",
    )
    with pytest.raises(DemoValidationError, match="identity mismatch"):
        load_risk_frame(tmp_path, "risk-sha256-000")


def test_load_risk_frame_rejects_missing(tmp_path: Path) -> None:
    with pytest.raises(DemoValidationError, match="missing"):
        load_risk_frame(tmp_path, "risk-sha256-000")


def test_build_spatial_rejects_missing_commit(tmp_path: Path) -> None:
    with pytest.raises(DemoValidationError, match="risk commit"):
        build_spatial(tmp_path, tmp_path)
