"""CLI wrapper for the machine-readable temporal semantics audit."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

from arctic_route_display.demo.temporal_audit import audit_frozen_config


def _workspace_root() -> Path:
    env = os.environ.get("ARCTIC_ROUTE_ROOT")
    if env and Path(env).is_dir():
        return Path(env)
    for parent in Path(__file__).resolve().parents:
        if (parent / "arctic_route_contracts").is_dir():
            return parent
    return Path.home()


def main(argv: list[str] | None = None) -> int:
    config = (
        Path(argv[0])
        if argv
        else _workspace_root() / "work_package_d" / "configs" / "demo_frozen_sources.json"
    )
    report = audit_frozen_config(config)
    print(json.dumps(report, ensure_ascii=False, sort_keys=True, indent=2))
    return 0 if report["overall_status"] == "PASS" else 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
