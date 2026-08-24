"""Fast demo preflight: frozen artifacts, schemas, worker, memory, port."""

from __future__ import annotations

import errno
import json
import os
import socket
from collections.abc import Mapping
from pathlib import Path
from typing import Any

from arctic_route_display.demo.errors import DemoValidationError
from arctic_route_display.demo.frozen_loader import (
    FrozenScenarioSource,
    load_frozen_scenario,
)
from arctic_route_display.demo.geo_integrity import run_geo_integrity_audit
from arctic_route_display.paths import expand_config_path


def _workspace_root() -> Path:
    env = os.environ.get("ARCTIC_ROUTE_ROOT")
    if env and Path(env).is_dir():
        return Path(env)
    for parent in Path(__file__).resolve().parents:
        if (parent / "arctic_route_contracts").is_dir():
            return parent
    return Path.home()


def _mem_available_gib() -> float:
    try:
        for line in Path("/proc/meminfo").read_text().splitlines():
            if line.startswith("MemAvailable:"):
                return float(line.split()[1]) / (1024 * 1024)
    except OSError:
        return 0.0
    return 0.0


def _port_free(port: int) -> tuple[bool, str]:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.bind(("127.0.0.1", port))
            return True, "free"
    except OSError as exc:
        if exc.errno == errno.EADDRINUSE:
            return False, "in use"
        return True, "unverifiable in sandbox"


def _source(config: Mapping[str, Any], key: str) -> FrozenScenarioSource:
    item = config[key]
    return FrozenScenarioSource(
        scenario_id=item["scenario_id"],
        display_name=item["display_name"],
        output_dir=str(expand_config_path(item["output_dir"])),
        expected=dict(item["expected"]),
        rc1_golden_run_report=(
            str(expand_config_path(item["rc1_golden_run_report"]))
            if item.get("rc1_golden_run_report")
            else None
        ),
        risk_store_root=str(expand_config_path(item["risk_store_root"])),
        notes=tuple(item.get("notes", ())),
    )


def run_preflight(
    config_path: str | Path,
    *,
    port: int = 8123,
    project_root: str | Path | None = None,
) -> list[dict[str, str]]:
    """Return check rows; raise DemoValidationError on hard failure."""

    root = Path(project_root or _workspace_root())
    rows: list[dict[str, str]] = []
    config = json.loads(Path(config_path).read_text(encoding="utf-8"))

    for key in ("scenario_a", "scenario_b"):
        source = _source(config, key)
        try:
            scenario = load_frozen_scenario(source)
            rows.append(
                {
                    "check": f"Frozen {key}",
                    "status": "PASS",
                    "detail": f"{scenario.scenario_id} gate={scenario.coverage.gate_passed}",
                }
            )
            if scenario.spatial is None:
                raise DemoValidationError(f"{key} has no spatial risk frames")
            rows.append(
                {
                    "check": f"Spatial {key}",
                    "status": "PASS",
                    "detail": (
                        f"frames={len(scenario.spatial.frames)} "
                        f"commit={scenario.spatial.commit_id[:18]}…"
                    ),
                }
            )
        except DemoValidationError as exc:
            rows.append({"check": f"Frozen {key}", "status": "FAIL", "detail": str(exc)})
            raise

    try:
        audit = run_geo_integrity_audit(config_path)
        rows.append(
            {
                "check": "Route Geospatial Integrity",
                "status": audit.overall_status,
                "detail": (
                    f"scenarios={len(audit.scenarios)} "
                    f"routes={sum(s.passed_routes for s in audit.scenarios)}/"
                    f"{sum(s.total_routes for s in audit.scenarios)} "
                    f"waypoint_hard={sum(s.waypoint_hard_violations for s in audit.scenarios)} "
                    f"edge_hard={sum(s.edge_hard_violations for s in audit.scenarios)} "
                    f"land={sum(s.land_intersections for s in audit.scenarios)} "
                    f"du={sum(s.data_unavailable_violations for s in audit.scenarios)} "
                    f"corner={sum(s.corner_cutting_violations for s in audit.scenarios)} "
                    f"viewer_px={sum(s.viewer_projection_intersections for s in audit.scenarios)}"
                ),
            }
        )
        if audit.overall_status != "PASS":
            raise DemoValidationError("route geospatial integrity gate failed")
    except (DemoValidationError, ValueError, json.JSONDecodeError, OSError) as exc:
        rows.append(
            {"check": "Route Geospatial Integrity", "status": "FAIL", "detail": str(exc)}
        )
        raise DemoValidationError(str(exc)) from exc

    schema_paths = {
        "D v3 schema": (
            root / "work_package_c" / "schemas"
            / "four-layer-route-plan-set-v3.schema.json"
        ),
        "preflight schema": (
            root / "arctic_route_orchestrator" / "schemas"
            / "planning-coverage-preflight-v1.schema.json"
        ),
    }
    for name, path in schema_paths.items():
        ok = path.is_file()
        rows.append({"check": name, "status": "PASS" if ok else "FAIL", "detail": str(path)})
        if not ok:
            raise DemoValidationError(f"missing schema: {path}")

    worker_script = root / "arctic_route_orchestrator" / "scripts" / "demo_live_worker.py"
    runner_script = root / "arctic_route_orchestrator" / "scripts" / "demo_live_runner.py"
    scripts = (
        ("live worker script", worker_script),
        ("live runner script", runner_script),
    )
    for name, path in scripts:
        ok = path.is_file()
        rows.append({"check": name, "status": "PASS" if ok else "FAIL", "detail": str(path)})
        if not ok:
            raise DemoValidationError(f"missing live script: {path}")

    available = _mem_available_gib()
    mem_ok = available >= 2.0
    rows.append(
        {
            "check": "Memory available",
            "status": "PASS" if mem_ok else "FAIL",
            "detail": f"{available:.1f} GiB (need >= 2.0)",
        }
    )
    if not mem_ok:
        raise DemoValidationError("not enough free memory for demo")

    port_ok, port_detail = _port_free(port)
    rows.append(
        {
            "check": f"Port {port}",
            "status": "PASS" if port_ok else "FAIL",
            "detail": port_detail,
        }
    )
    if not port_ok:
        raise DemoValidationError(f"port {port} is already in use")
    return rows
