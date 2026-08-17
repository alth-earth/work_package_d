"""CLI wrapper for the machine-readable temporal semantics audit."""

from __future__ import annotations

import json
import sys
from pathlib import Path

from arctic_route_display.demo.temporal_audit import audit_frozen_config


def main(argv: list[str] | None = None) -> int:
    config = (
        Path(argv[0])
        if argv
        else Path("/root/my_project/work_package_d/configs/demo_frozen_sources.json")
    )
    report = audit_frozen_config(config)
    print(json.dumps(report, ensure_ascii=False, sort_keys=True, indent=2))
    return 0 if report["overall_status"] == "PASS" else 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
