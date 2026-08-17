"""Minimal display CLI: produce a render-ready snapshot."""

from __future__ import annotations

import argparse
import http.server
import json
import subprocess
import sys
import threading
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, ClassVar

from arctic_route_display.demo.frozen_loader import (
    DemoValidationError,
    FrozenScenarioSource,
    load_frozen_scenario,
)
from arctic_route_display.demo.geo_integrity import run_geo_integrity_audit
from arctic_route_display.demo.live_loader import load_live_result
from arctic_route_display.demo.preflight import run_preflight
from arctic_route_display.loader import (
    DisplayValidationError,
    load_coverage_preflight,
    load_v2_batch,
    load_v3_group,
)
from arctic_route_display.models import DisplayState


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="arctic-route-display",
        description="只读消费 C 已发布的 v3/v2 路线制品并生成展示快照。",
    )
    sub = parser.add_subparsers(dest="command", required=True)
    snapshot = sub.add_parser("snapshot", help="生成展示快照 JSON")
    snapshot.add_argument("--v3", type=Path, help="v3 整组 JSON")
    snapshot.add_argument("--v2", type=Path, help="v2 后备批次 JSON")
    snapshot.add_argument(
        "--v3-schema",
        type=Path,
        default=Path(
            "/root/my_project/work_package_c/schemas/four-layer-route-plan-set-v3.schema.json"
        ),
        help="v3 JSON Schema（默认指向工作包 C 的共享 Schema）",
    )
    snapshot.add_argument(
        "--v2-schema",
        type=Path,
        default=Path("/root/my_project/work_package_c/schemas/route-plan-v2.schema.json"),
    )
    snapshot.add_argument("--output", type=Path, required=True)
    snapshot.add_argument("--layer", default=None, help="默认选中层")
    snapshot.add_argument(
        "--coverage",
        type=Path,
        help="可选：附带 orchestrator 的 planning-coverage-preflight.json",
    )
    snapshot.add_argument(
        "--coverage-schema",
        type=Path,
        default=Path(
            "/root/my_project/arctic_route_orchestrator/schemas/"
            "planning-coverage-preflight-v1.schema.json"
        ),
    )
    coverage = sub.add_parser(
        "coverage",
        help="读取规划覆盖预检文档并输出可解释摘要",
    )
    coverage.add_argument("path", type=Path)
    coverage.add_argument(
        "--schema",
        type=Path,
        default=Path(
            "/root/my_project/arctic_route_orchestrator/schemas/"
            "planning-coverage-preflight-v1.schema.json"
        ),
    )
    demo = sub.add_parser(
        "demo",
        help="Demo Engineering: preflight, frozen build, live smoke, local viewer",
    )
    demo_sub = demo.add_subparsers(dest="demo_command", required=True)
    preflight = demo_sub.add_parser("preflight", help="快速演示预检")
    preflight.add_argument(
        "--config",
        type=Path,
        default=Path("/root/my_project/work_package_d/configs/demo_frozen_sources.json"),
    )
    preflight.add_argument("--port", type=int, default=8123)
    build = demo_sub.add_parser("build", help="构建统一 demo-state.json（冻结 A/B）")
    build.add_argument(
        "--config",
        type=Path,
        default=Path("/root/my_project/work_package_d/configs/demo_frozen_sources.json"),
    )
    build.add_argument(
        "--output",
        type=Path,
        default=Path(
            "/root/my_project/work_package_a/data/output/rc2-smoke/demo-state.json"
        ),
    )
    build.add_argument("--live-result", type=Path, default=None)
    run_live = demo_sub.add_parser("run-live", help="运行真实小窗重规划（≤2min）")
    run_live.add_argument(
        "--config",
        type=Path,
        default=Path("/root/my_project/work_package_d/configs/demo_frozen_sources.json"),
    )
    run_live.add_argument(
        "--output",
        type=Path,
        default=Path(
            "/root/my_project/work_package_a/data/output/rc2-smoke/live-result.json"
        ),
    )
    run_live.add_argument(
        "--orchestrator-python",
        type=Path,
        default=Path("/root/my_project/arctic_route_orchestrator/.venv/bin/python"),
    )
    geo = demo_sub.add_parser(
        "geo-integrity",
        help="机器可验证 Route Geospatial Integrity gate（冻结制品 + 风险帧）",
    )
    geo.add_argument(
        "--config",
        type=Path,
        default=Path("/root/my_project/work_package_d/configs/demo_frozen_sources.json"),
    )
    geo.add_argument(
        "--output",
        type=Path,
        default=Path(
            "/root/my_project/work_package_a/data/output/rc2-smoke/"
            "route-geospatial-integrity.json"
        ),
    )
    serve = demo_sub.add_parser("serve", help="本地只读 Demo Viewer（localhost）")
    serve.add_argument(
        "--state",
        type=Path,
        default=Path(
            "/root/my_project/work_package_a/data/output/rc2-smoke/demo-state.json"
        ),
    )
    serve.add_argument("--port", type=int, default=8123)
    serve.add_argument(
        "--config",
        type=Path,
        default=Path("/root/my_project/work_package_d/configs/demo_frozen_sources.json"),
    )
    serve.add_argument(
        "--orchestrator-python",
        type=Path,
        default=Path("/root/my_project/arctic_route_orchestrator/.venv/bin/python"),
    )
    serve.add_argument(
        "--live-output",
        type=Path,
        default=Path(
            "/root/my_project/work_package_a/data/output/rc2-smoke/live-result.json"
        ),
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.command == "demo":
        try:
            if args.demo_command == "preflight":
                rows = run_preflight(args.config, port=args.port)
                print("Demo Preflight")
                for row in rows:
                    print(
                        f"  {row['check']:<30} {row['status']:<5} {row['detail']}"
                    )
                print("READY FOR DEMO")
                return 0
            if args.demo_command == "geo-integrity":
                report = run_geo_integrity_audit(args.config)
                args.output.parent.mkdir(parents=True, exist_ok=True)
                args.output.write_text(
                    json.dumps(report.to_dict(), ensure_ascii=False, sort_keys=True, indent=2)
                    + "\n",
                    encoding="utf-8",
                )
                print("Route Geospatial Integrity")
                for scenario in report.scenarios:
                    print(
                        f"  {scenario.scenario_id:<48} {scenario.status:<5} "
                        f"routes={scenario.passed_routes}/{scenario.total_routes} "
                        f"wp_hard={scenario.waypoint_hard_violations} "
                        f"edge_hard={scenario.edge_hard_violations} "
                        f"land={scenario.land_intersections} "
                        f"du={scenario.data_unavailable_violations} "
                        f"corner={scenario.corner_cutting_violations} "
                        f"viewer_px={scenario.viewer_projection_intersections}"
                    )
                print(f"OVERALL = {report.overall_status}")
                print(
                    json.dumps(
                        {
                            "ok": report.overall_status == "PASS",
                            "output": str(args.output),
                        }
                    )
                )
                return 0 if report.overall_status == "PASS" else 2
            if args.demo_command == "build":
                config = json.loads(args.config.read_text(encoding="utf-8"))
                scenarios = [
                    load_frozen_scenario(_demo_source(config, "scenario_a")),
                    load_frozen_scenario(_demo_source(config, "scenario_b")),
                ]
                audit = run_geo_integrity_audit(args.config)
                audit_by_scenario = {item.scenario_id: item for item in audit.scenarios}
                if args.live_result is not None:
                    live = load_live_result(
                        args.live_result,
                        frozen_coverage=scenarios[1].coverage,
                    )
                    scenarios.append(live)
                document = {
                    "schema_version": "d.demo-state.v1",
                    "generated_at": datetime.now(UTC).isoformat(),
                    "scenarios": [
                        {
                            **scenario.to_dict(),
                            "geo_integrity": (
                                audit_by_scenario[scenario.scenario_id].summary()
                                if scenario.scenario_id in audit_by_scenario
                                else {
                                    "scenario_id": scenario.scenario_id,
                                    "status": "NOT_RUN",
                                    "detail": (
                                        "live result is audited separately after "
                                        "frozen audit"
                                    ),
                                }
                            ),
                        }
                        for scenario in scenarios
                    ],
                }
                args.output.parent.mkdir(parents=True, exist_ok=True)
                args.output.write_text(
                    json.dumps(
                        document,
                        ensure_ascii=False,
                        sort_keys=True,
                        indent=2,
                    )
                    + "\n",
                    encoding="utf-8",
                )
                print(
                    json.dumps(
                        {
                            "ok": True,
                            "output": str(args.output),
                            "scenarios": len(scenarios),
                        },
                        ensure_ascii=False,
                        sort_keys=True,
                    )
                )
                return 0
            if args.demo_command == "run-live":
                config = json.loads(args.config.read_text(encoding="utf-8"))
                paths = dict(config["live"])
                paths["output_path"] = str(args.output)
                args.output.parent.mkdir(parents=True, exist_ok=True)
                paths_file = args.output.parent / ".demo-live-paths.json"
                paths_file.write_text(
                    json.dumps(paths, sort_keys=True),
                    encoding="utf-8",
                )
                runner = Path(
                    "/root/my_project/arctic_route_orchestrator/scripts/demo_live_runner.py"
                )
                proc = subprocess.run(
                    [str(args.orchestrator_python), str(runner), str(paths_file)],
                    capture_output=True,
                    text=True,
                )
                print(proc.stdout, end="")
                if proc.stderr:
                    print(proc.stderr, file=sys.stderr, end="")
                return proc.returncode
            if args.demo_command == "serve":
                return _serve_demo(
                    args.state,
                    args.port,
                    args.config,
                    args.orchestrator_python,
                    args.live_output,
                )
        except (
            DemoValidationError,
            FileNotFoundError,
            json.JSONDecodeError,
            OSError,
        ) as exc:
            print(
                json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False),
                file=sys.stderr,
            )
            return 2
    state = DisplayState()
    try:
        coverage_view = None
        if args.command == "snapshot":
            if args.v3 is not None:
                state.publish_v3(
                    load_v3_group(args.v3, schema_path=args.v3_schema)
                )
            if args.v2 is not None:
                state.set_v2_fallback(load_v2_batch(args.v2, schema_path=args.v2_schema))
            if args.coverage is not None:
                coverage_view = load_coverage_preflight(
                    args.coverage,
                    schema_path=args.coverage_schema,
                )
    except DisplayValidationError as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 2
    if args.command == "coverage":
        view = load_coverage_preflight(args.path, schema_path=args.schema)
        print(
            json.dumps(
                {
                    "ok": True,
                    "run_id": view.run_id,
                    "scenario_id": view.scenario_id,
                    "corridor_id": view.corridor_id,
                    "generation_id": view.generation_id,
                    "input_revision": view.input_revision,
                    "frames_checked": view.frames_checked,
                    "frames_expected": view.frames_expected,
                    "gate_passed": view.gate_passed,
                    "land_nodes": view.land_nodes,
                    "data_unavailable_nodes": view.data_unavailable_nodes,
                    "ice_free_neutralized_nodes": view.ice_free_neutralized_nodes,
                    "other_hard_nodes": (
                        0
                        if view.worst_frame is None
                        else int(view.worst_frame.get("other_hard_nodes", 0))
                    ),
                    "hard_nodes": view.hard_nodes,
                    "planning_available_nodes": view.total_nodes - view.hard_nodes,
                    "total_nodes": view.total_nodes,
                    "source": str(args.path),
                },
                ensure_ascii=False,
                sort_keys=True,
                indent=2,
            )
        )
        return 0
    latest = state.latest_complete
    snapshot = {
        "schema_version": "d.display-snapshot.v1",
        "status": state.status,
        "warnings": state.warnings,
        "selected_layer": args.layer,
        "coverage": None
        if coverage_view is None
        else {
            "gate_passed": coverage_view.gate_passed,
            "frames_checked": coverage_view.frames_checked,
            "land_nodes": coverage_view.land_nodes,
            "data_unavailable_nodes": coverage_view.data_unavailable_nodes,
            "ice_free_neutralized_nodes": coverage_view.ice_free_neutralized_nodes,
            "planning_available_nodes": coverage_view.total_nodes - coverage_view.hard_nodes,
            "total_nodes": coverage_view.total_nodes,
        },
        "latest_group": None if latest is None else _group_summary(latest),
        "previous_group_id": (
            None if state.previous_complete is None else state.previous_complete.group_id
        ),
        "v2_fallback": None if state.v2_fallback is None else _v2_summary(state.v2_fallback),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(snapshot, ensure_ascii=False, sort_keys=True, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps({"ok": True, "output": str(args.output)}, ensure_ascii=False))
    return 0


def _group_summary(view) -> dict[str, object]:
    return {
        "group_id": view.group_id,
        "run_id": view.run_id,
        "scenario_id": view.scenario_id,
        "generation_id": view.generation_id,
        "input_revision": view.input_revision,
        "route_count": view.route_count,
        "layers": [
            {
                "layer_id": layer.layer_id,
                "objectives": layer.objectives,
                "plan_count": len(layer.plans),
            }
            for layer in view.layers
        ],
    }


def _v2_summary(view) -> dict[str, object]:
    return {
        "run_id": view.run_id,
        "scenario_id": view.scenario_id,
        "generation_id": view.generation_id,
        "objectives": view.objectives,
        "plan_count": len(view.plans),
    }


def _demo_source(config, key: str) -> FrozenScenarioSource:
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


class _DemoHandler(http.server.BaseHTTPRequestHandler):
    state_path: Path | None = None
    config_path: Path | None = None
    orchestrator_python: Path | None = None
    live_output: Path | None = None
    live_coverage: Any = None
    _live_lock = threading.Lock()
    _live_state: ClassVar[dict[str, Any]] = {"status": "IDLE"}

    def _send_bytes(self, payload: bytes, content_type: str, status: int = 200) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _send_json(self, payload: dict[str, Any], status: int = 200) -> None:
        self._send_bytes(
            json.dumps(payload, ensure_ascii=False, sort_keys=True).encode("utf-8"),
            "application/json",
            status,
        )

    def _live_status(self) -> dict[str, Any]:
        with self._live_lock:
            state = dict(_DemoHandler._live_state)
        if state.get("status") == "RUNNING" and state.get("started_at"):
            started = datetime.fromisoformat(state["started_at"])
            state["elapsed"] = round((datetime.now(UTC) - started).total_seconds(), 1)
            if state.get("stage") == "starting" and state["elapsed"] > 12:
                state["stage"] = "planning"
        return state

    def do_GET(self) -> None:
        if self.path in ("/", "/index.html"):
            html = (
                Path(__file__).parents[2] / "web" / "demo_viewer.html"
            ).read_text(encoding="utf-8")
            self._send_bytes(html.encode("utf-8"), "text/html; charset=utf-8")
            return
        if self.path == "/demo-state.json":
            if self.state_path is None or not Path(self.state_path).is_file():
                self.send_response(404)
                self.end_headers()
                return
            data = Path(self.state_path).read_bytes()
            self._send_bytes(data, "application/json")
            return
        if self.path == "/api/live/status":
            self._send_json(self._live_status())
            return
        self.send_response(404)
        self.end_headers()

    def do_POST(self) -> None:
        if self.path == "/api/live/start":
            with self._live_lock:
                if _DemoHandler._live_state.get("status") == "RUNNING":
                    self._send_json(
                        {"ok": False, "error": "live computation already running"}
                    )
                    return
                _DemoHandler._live_state = {
                    "status": "RUNNING",
                    "started_at": datetime.now(UTC).isoformat(),
                    "stage": "starting",
                    "elapsed": 0.0,
                }
            thread = threading.Thread(target=self._run_live, daemon=True)
            thread.start()
            self._send_json({"ok": True, "status": "RUNNING"})
            return
        self.send_response(404)
        self.end_headers()

    def _run_live(self) -> None:
        try:
            config = json.loads(Path(self.config_path).read_text(encoding="utf-8"))
            paths = dict(config["live"])
            paths["output_path"] = str(self.live_output)
            self.live_output.parent.mkdir(parents=True, exist_ok=True)
            paths_file = self.live_output.parent / ".demo-live-paths.json"
            paths_file.write_text(json.dumps(paths, sort_keys=True), encoding="utf-8")
            runner = (
                Path(self.orchestrator_python).parents[2]
                / "scripts"
                / "demo_live_runner.py"
            )
            proc = subprocess.Popen(
                [str(self.orchestrator_python), str(runner), str(paths_file)],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
            )
            assert proc.stdout is not None
            output_lines: list[str] = []
            for line in proc.stdout:
                line = line.strip()
                if not line:
                    continue
                output_lines.append(line)
                output_lines = output_lines[-20:]
                if '"event": "stage_start"' in line or '"stage_start"' in line:
                    with self._live_lock:
                        _DemoHandler._live_state["stage"] = "planning"
                elif '"event": "stage_done"' in line or '"stage_done"' in line:
                    with self._live_lock:
                        _DemoHandler._live_state["stage"] = "publishing"
            return_code = proc.wait()
            if return_code != 0:
                message = "live computation failed"
                try:
                    document = json.loads(self.live_output.read_text(encoding="utf-8"))
                    if document.get("status") in ("TIMEOUT", "FAIL"):
                        message = document.get("message") or message
                except (OSError, json.JSONDecodeError):
                    pass
                with self._live_lock:
                    _DemoHandler._live_state = {
                        "status": "FAIL",
                        "ok": False,
                        "error": message,
                        "detail": "\n".join(output_lines[-10:]),
                    }
                return
            scenario = load_live_result(
                self.live_output,
                frozen_coverage=self.live_coverage,
            )
            with self._live_lock:
                _DemoHandler._live_state = {
                    "status": "DONE",
                    "ok": True,
                    "scenario": scenario.to_dict(),
                }
        except Exception as exc:
            with self._live_lock:
                _DemoHandler._live_state = {
                    "status": "FAIL",
                    "ok": False,
                    "error": str(exc),
                }

    def log_message(self, format: str, *args: Any) -> None:
        return


def _serve_demo(
    state_path: Path,
    port: int,
    config_path: Path,
    orchestrator_python: Path,
    live_output: Path,
) -> int:
    config = json.loads(config_path.read_text(encoding="utf-8"))
    scenario_b = load_frozen_scenario(_demo_source(config, "scenario_b"))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), _DemoHandler)
    _DemoHandler.state_path = state_path
    _DemoHandler.config_path = config_path
    _DemoHandler.orchestrator_python = orchestrator_python
    _DemoHandler.live_output = live_output
    _DemoHandler.live_coverage = scenario_b.coverage
    print(json.dumps({"ok": True, "url": f"http://127.0.0.1:{port}/"}, ensure_ascii=False))
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
