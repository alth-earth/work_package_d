"""Fast demo preflight: frozen artifacts, schemas, worker, memory, port."""

from __future__ import annotations

import errno
import json
import socket
from collections.abc import Mapping
from pathlib import Path
from typing import Any

from arctic_route_display.demo.errors import DemoValidationError
from arctic_route_display.demo.frozen_loader import (
    FrozenScenarioSource,
    load_frozen_scenario,
)


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
        output_dir=item["output_dir"],
        expected=dict(item["expected"]),
        rc1_golden_run_report=item.get("rc1_golden_run_report"),
        risk_store_root=item.get("risk_store_root"),
        notes=tuple(item.get("notes", ())),
    )


def run_preflight(
    config_path: str | Path,
    *,
    port: int = 8123,
    project_root: str | Path = Path("/root/my_project"),
) -> list[dict[str, str]]:
    """Return check rows; raise DemoValidationError on hard failure."""

    root = Path(project_root)
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
