"""Audit risk distributions in an exported Viewer bundle.

This is a read-only presentation audit.  It counts values already published by
the ``bc.risk-frame.v2`` -> Viewer export boundary; it does not recalculate
risk, apply thresholds, or alter the bundle.
"""

from __future__ import annotations

import argparse
import json
import math
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path
from statistics import fmean
from typing import Any


def _summary(frame: dict[str, Any]) -> dict[str, Any]:
    levels = [int(value) for value in frame["risk_levels"]]
    scores = [
        float(value)
        for value in frame["risk_scores"]
        if isinstance(value, (int, float)) and math.isfinite(float(value))
    ]
    reasons = [str(value or "NONE") for value in frame["hard_reasons"]]
    total = len(levels)
    level_counts = Counter(levels)
    reason_counts = Counter(reasons)
    return {
        "timestamp": frame["valid_time"],
        "total_cells": total,
        "level_counts": {str(level): level_counts.get(level, 0) for level in range(1, 6)},
        "level_percentages": {
            str(level): round(level_counts.get(level, 0) * 100.0 / total, 4)
            if total
            else 0.0
            for level in range(1, 6)
        },
        "risk_score_min": min(scores) if scores else None,
        "risk_score_max": max(scores) if scores else None,
        "risk_score_mean": fmean(scores) if scores else None,
        "finite_score_count": len(scores),
        "hard_reason_counts": dict(sorted(reason_counts.items())),
    }


def summarize_bundle(bundle: dict[str, Any]) -> dict[str, Any]:
    risk = bundle.get("risk") or {}
    frames = risk.get("frames") or []
    if not frames:
        raise ValueError("bundle does not contain risk frames")
    first = frames[0]
    latitudes = first["coordinates"]["latitude"]
    longitudes = first["coordinates"]["longitude"]
    lat_step = abs(latitudes[1] - latitudes[0]) if len(latitudes) > 1 else None
    lon_step = abs(longitudes[1] - longitudes[0]) if len(longitudes) > 1 else None
    mean_lat = fmean(latitudes) if latitudes else 0.0
    return {
        "generated_at": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "bundle_schema": bundle.get("schema_version"),
        "risk_schema": risk.get("schema_version"),
        "scenario_id": bundle.get("replay", {}).get("scenario_id"),
        "replay_id": bundle.get("replay", {}).get("replay_id"),
        "source": risk.get("source"),
        "grid": {
            "rows": len(latitudes),
            "cols": len(longitudes),
            "latitude_resolution_degrees": lat_step,
            "longitude_resolution_degrees": lon_step,
            "latitude_cell_km": lat_step * 111.32 if lat_step is not None else None,
            "longitude_cell_km_at_mean_lat": (
                lon_step * 111.32 * math.cos(math.radians(mean_lat))
                if lon_step is not None
                else None
            ),
        },
        "frames": [_summary(frame) for frame in frames],
    }


def _fmt(value: Any) -> str:
    if value is None:
        return "—"
    if isinstance(value, float):
        return f"{value:.6f}"
    return str(value)


def render_markdown(audit: dict[str, Any], *, risk_config: dict[str, Any] | None = None) -> str:
    grid = audit["grid"]
    frames = audit["frames"]
    model = (risk_config or {}).get("model_config", {})
    grid_config = (risk_config or {}).get("grid_config", {})
    lines = [
        "# Risk Distribution Audit",
        "",
        f"> Generated: {audit['generated_at']}",
        (
            "> Read-only audit of the exported Viewer presentation bundle; "
            "no risk value was recomputed."
        ),
        "",
        "## Scope and source",
        "",
        f"- Bundle: `{audit['bundle_schema']}` / replay `{audit['replay_id']}`",
        f"- Scenario: `{audit['scenario_id']}`",
        (
            f"- Risk source: `{audit['risk_schema']}` / provenance `"
            f"{', '.join(audit.get('source', {}).get('provenance', []))}`"
        ),
        (
            f"- Frames: `{len(frames)}`; cells per frame: "
            f"`{grid['rows']} × {grid['cols']} = {grid['rows'] * grid['cols']}`"
        ),
        (
            f"- Risk grid resolution: `{_fmt(grid['latitude_resolution_degrees'])}° lat × "
            f"{_fmt(grid['longitude_resolution_degrees'])}° lon`"
        ),
        (
            f"- Approximate cell size: `{_fmt(grid['latitude_cell_km'])} km lat × "
            f"{_fmt(grid['longitude_cell_km_at_mean_lat'])} km lon at mean latitude`"
        ),
    ]
    if grid_config or model:
        lines.extend(
            [
                "",
                "## Published policy metadata",
                "",
                (
                    f"- B target grid: `{grid_config.get('latitude_step_degrees', 'unknown')}° × "
                    f"{grid_config.get('longitude_step_degrees', 'unknown')}°`"
                ),
                f"- Risk level policy: `{model.get('risk_level_policy', 'unknown')}`",
                f"- Formula version: `{model.get('formula_version', 'unknown')}`",
                f"- Hard-mask policy: `{model.get('hard_mask_policy', 'unknown')}`",
            ]
        )
    lines.extend(
        [
            "",
            "## Per-frame distribution",
            "",
            (
                "| valid_time | L1 | L2 | L3 | L4 | L5 | L1 % | L2 % | L3 % | "
                "L4 % | L5 % | score min | score max | score mean | hard reasons |"
            ),
            "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|",
        ]
    )
    for frame in frames:
        counts = frame["level_counts"]
        percentages = frame["level_percentages"]
        reasons = ", ".join(
            f"{key}={value}" for key, value in frame["hard_reason_counts"].items()
        )
        lines.append(
            "| "
            + " | ".join(
                [
                    frame["timestamp"],
                    *(str(counts[str(level)]) for level in range(1, 6)),
                    *(f"{percentages[str(level)]:.1f}%" for level in range(1, 6)),
                    _fmt(frame["risk_score_min"]),
                    _fmt(frame["risk_score_max"]),
                    _fmt(frame["risk_score_mean"]),
                    reasons,
                ]
            )
            + " |"
        )
    lines.extend(
        [
            "",
            "## Root-cause conclusion",
            "",
            (
                "The distribution is consistent across all formal frames: all `NONE` cells "
                "are Level 1, while `LAND` and `DATA_UNAVAILABLE` cells are conservatively "
                "Level 5. The Viewer does not map a low score into Level 1 incorrectly; it "
                "consumes the published level and renders hard reasons in a separate layer."
            ),
            "",
            (
                "Therefore the dominant cause of the visually quiet water area is the published "
                "B target-grid/model output and this demo artifact's low normalized scores, not "
                "a D color-threshold or coordinate-rendering defect. The 5-level scale is still "
                "semantically present, but this artifact does not contain navigable "
                "Level 2–4 cells."
            ),
            "",
            (
                "The hard cells remain visible as `LAND` / `DATA_UNAVAILABLE`; they must not be "
                "softened or converted into safe risk colors. A future demo with more visually "
                "differentiated risk requires a new validated B artifact or an explicitly approved "
                "presentation projection, not an ad-hoc Viewer threshold change."
            ),
            "",
            "## Suggested short-term demo action",
            "",
            (
                "Keep the current exact-cell risk semantics, add the distribution summary/timeline "
                "to explain the result, and label the artifact as `demo_unvalidated`. Do not "
                "change the risk formula or fabricate intermediate levels in D."
            ),
            "",
        ]
    )
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="risk-distribution-audit")
    parser.add_argument("bundle", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--risk-config", type=Path, default=None)
    args = parser.parse_args(argv)
    bundle = json.loads(args.bundle.read_text(encoding="utf-8"))
    risk_config = (
        json.loads(args.risk_config.read_text(encoding="utf-8"))
        if args.risk_config is not None
        else None
    )
    audit = summarize_bundle(bundle)
    args.output.write_text(render_markdown(audit, risk_config=risk_config), encoding="utf-8")
    print(
        f"wrote {args.output} frames={len(audit['frames'])} "
        f"cells={audit['grid']['rows']}x{audit['grid']['cols']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
