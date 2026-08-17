"""Build bounded spatial presentation frames from committed frozen risk stores.

The demo only reads frames that are already referenced by the frozen output's
``risk/full-window-commit.json``.  No new calculation, no mutation, no network.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from arctic_route_display.demo.errors import DemoValidationError
from arctic_route_display.demo.models import (
    DemoFrameView,
    DemoSpatial,
)


def load_risk_frame(risk_store_root: str | Path, risk_id: str) -> dict[str, Any]:
    """Load one immutable risk frame and verify its identity."""

    path = Path(risk_store_root) / "frames" / f"{risk_id}.json"
    if not path.is_file():
        raise DemoValidationError(f"risk frame missing: {path}")
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise DemoValidationError(f"risk frame not JSON: {path}") from exc
    if document.get("risk_id") != risk_id:
        raise DemoValidationError(
            f"risk frame identity mismatch: {document.get('risk_id')} != {risk_id}"
        )
    return document


def build_spatial(
    output_dir: str | Path,
    risk_store_root: str | Path,
    frame_indexes: tuple[int, ...] = (0, 6),
) -> DemoSpatial:
    """Build compact spatial views for selected real risk frames."""

    output = Path(output_dir)
    commit_path = output / "risk" / "full-window-commit.json"
    try:
        commit = json.loads(commit_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise DemoValidationError(f"risk commit not JSON: {commit_path}") from exc
    except OSError as exc:
        raise DemoValidationError(f"risk commit missing: {commit_path}") from exc
    frames_meta = commit.get("frames")
    if not isinstance(frames_meta, list):
        raise DemoValidationError("risk commit has no frames list")
    selected = [index for index in frame_indexes if index < len(frames_meta)]
    if not selected:
        raise DemoValidationError("no selectable risk frames in commit")

    grid_id = ""
    views: list[DemoFrameView] = []
    for index in selected:
        meta = frames_meta[index]
        document = load_risk_frame(risk_store_root, meta["risk_id"])
        payload = document.get("payload")
        if not isinstance(payload, dict):
            raise DemoValidationError(f"risk frame {meta['risk_id']} has no payload")
        coordinates = payload.get("coordinates", {})
        variables = payload.get("variables", {})
        latitudes = coordinates.get("latitude")
        longitudes = coordinates.get("longitude")
        hard_reasons = variables.get("hard_reason")
        risk_scores = variables.get("risk_score")
        risk_levels = variables.get("risk_level")
        confidences = variables.get("confidence")
        if not (
            isinstance(latitudes, list)
            and isinstance(longitudes, list)
            and isinstance(hard_reasons, list)
            and isinstance(risk_scores, list)
            and isinstance(risk_levels, list)
            and isinstance(confidences, list)
        ):
            raise DemoValidationError(
                f"risk frame {meta['risk_id']} missing spatial arrays"
            )
        if not (
            len(hard_reasons) == len(latitudes)
            and all(len(row) == len(longitudes) for row in hard_reasons)
            and all(len(row) == len(longitudes) for row in risk_scores)
            and all(len(row) == len(longitudes) for row in risk_levels)
            and all(len(row) == len(longitudes) for row in confidences)
        ):
            raise DemoValidationError(
                f"risk frame {meta['risk_id']} array shapes mismatch grid"
            )

        flat: dict[str, list[Any]] = {
            "longitudes": [],
            "latitudes": [],
            "hard_reasons": [],
            "risk_scores": [],
            "risk_levels": [],
            "confidences": [],
            "available": [],
        }
        for row, latitude in enumerate(latitudes):
            for column, longitude in enumerate(longitudes):
                reason = hard_reasons[row][column]
                flat["longitudes"].append(longitude)
                flat["latitudes"].append(latitude)
                flat["hard_reasons"].append(reason)
                raw_score = risk_scores[row][column]
                raw_level = risk_levels[row][column]
                raw_confidence = confidences[row][column]
                flat["risk_scores"].append(
                    0.0 if raw_score is None else float(raw_score)
                )
                flat["risk_levels"].append(0 if raw_level is None else int(raw_level))
                flat["confidences"].append(
                    0.0 if raw_confidence is None else float(raw_confidence)
                )
                flat["available"].append(reason == "NONE")
        if not grid_id:
            attributes = payload.get("attributes", {})
            grid_id = str(attributes.get("grid_id", ""))
        views.append(
            DemoFrameView(
                frame_index=int(document.get("frame_index", index)),
                valid_time=str(document.get("valid_time", "")),
                longitudes=tuple(flat["longitudes"]),
                latitudes=tuple(flat["latitudes"]),
                hard_reasons=tuple(flat["hard_reasons"]),
                risk_scores=tuple(flat["risk_scores"]),
                risk_levels=tuple(flat["risk_levels"]),
                confidences=tuple(flat["confidences"]),
                available=tuple(flat["available"]),
            )
        )
    return DemoSpatial(
        commit_id=str(commit.get("commit_id", "")),
        grid_id=grid_id,
        frames=tuple(views),
    )
