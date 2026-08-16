"""Load and group published C route documents for the display layer."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator
from referencing import Registry, Resource
from referencing.exceptions import Unretrievable
from referencing.jsonschema import DRAFT202012

from arctic_route_display.models import LayerView, RouteSetView, V2BatchView


class DisplayValidationError(ValueError):
    """Raised when a published route document cannot be consumed by D."""


def _load_json(path: str | Path) -> dict[str, Any]:
    try:
        document = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise DisplayValidationError(f"cannot read {path}: {exc}") from exc
    if not isinstance(document, dict):
        raise DisplayValidationError(f"{path} must contain a JSON object")
    return document


def _validate(document: dict[str, Any], schema_path: str | Path | None) -> None:
    if schema_path is None:
        return
    schema_path = Path(schema_path)
    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    schema_dir = schema_path.parent

    def retrieve(uri: str):
        filename = uri.rsplit("/", 1)[-1]
        local = schema_dir / filename
        if local.is_file():
            return Resource.from_contents(
                json.loads(local.read_text(encoding="utf-8")),
                default_specification=DRAFT202012,
            )
        raise Unretrievable(uri)

    registry = Registry(retrieve=retrieve)
    errors = sorted(
        Draft202012Validator(schema, registry=registry).iter_errors(document),
        key=lambda error: list(error.path),
    )
    if errors:
        raise DisplayValidationError(f"schema errors: {errors[0].message}")


def load_v3_group(
    path: str | Path,
    *,
    schema_path: str | Path | None = None,
) -> RouteSetView:
    """Load a v3 four-layer route-plan set and group plans by layer.

    The document must contain four layers (full_voyage, main_corridor_24_72h,
    rolling_0_24h, executable_0_6h), each with exactly three objectives.
    """

    document = _load_json(path)
    _validate(document, schema_path)
    raw_layers = document.get("layers")
    if isinstance(raw_layers, list) and len(raw_layers) == 4:
        bundles = [
            (item.get("planning_layer"), item)
            for item in raw_layers
            if isinstance(item, dict)
        ]
        if len(bundles) != 4 or any(not layer_id for layer_id, _ in bundles):
            raise DisplayValidationError(
                "v3 group list layers must each declare planning_layer"
            )
    elif isinstance(raw_layers, dict) and len(raw_layers) == 4:
        bundles = list(raw_layers.items())
    else:
        raise DisplayValidationError("v3 group must contain exactly four layers")
    layers: list[LayerView] = []
    for layer_id, bundle in bundles:
        if not isinstance(bundle, dict):
            raise DisplayValidationError(f"layer {layer_id} is not an object")
        plans = bundle.get("plans")
        if not isinstance(plans, dict) or len(plans) != 3:
            raise DisplayValidationError(
                f"layer {layer_id} must contain exactly three plans"
            )
        objectives = tuple(sorted(plans))
        layers.append(
            LayerView(
                layer_id=layer_id,
                objectives=objectives,
                plans=tuple(plans[name] for name in objectives),
            )
        )
    expected_layers = {
        "full_voyage",
        "main_corridor_24_72h",
        "rolling_0_24h",
        "executable_0_6h",
    }
    if {layer.layer_id for layer in layers} != expected_layers:
        raise DisplayValidationError("v3 group layers differ from the fixed four layers")
    return RouteSetView(
        schema_version=str(document.get("schema_version", "")),
        group_id=str(document.get("layer_set_id") or document.get("group_id") or ""),
        run_id=str(document.get("run_id", "")),
        scenario_id=str(document.get("scenario_id", "")),
        generation_id=int(document.get("generation_id", -1)),
        input_revision=int(document.get("input_revision", -1)),
        layers=tuple(layers),
        source_path=str(path),
    )


def load_v2_batch(
    path: str | Path,
    *,
    schema_path: str | Path | None = None,
) -> V2BatchView:
    """Load a v2 fallback batch (mapping of objective -> route-plan-v2)."""

    document = _load_json(path)
    _validate(document, schema_path)
    plans = document.get("plans", document)
    if not isinstance(plans, dict) or len(plans) != 3:
        raise DisplayValidationError("v2 batch must contain exactly three plans")
    objectives = tuple(sorted(plans))
    return V2BatchView(
        schema_version=str(document.get("schema_version", "")),
        run_id=str(document.get("run_id", "")),
        scenario_id=str(document.get("scenario_id", "")),
        generation_id=int(document.get("generation_id", -1)),
        objectives=objectives,
        plans=tuple(plans[name] for name in objectives),
        source_path=str(path),
    )
