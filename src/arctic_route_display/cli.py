"""Minimal display CLI: produce a render-ready snapshot."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

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
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
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
