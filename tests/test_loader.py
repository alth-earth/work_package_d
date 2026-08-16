import json

import pytest

from arctic_route_display.loader import (
    DisplayValidationError,
    load_v3_group,
)


def _document() -> dict:
    layer = {
        "plans": {
            "fastest": {"id": "f"},
            "low_risk": {"id": "l"},
            "recommended": {"id": "r"},
        }
    }
    return {
        "schema_version": "cd.four-layer-route-plan-set.v3",
        "layer_set_id": "set-1",
        "run_id": "run-1",
        "scenario_id": "scenario-1",
        "generation_id": 0,
        "input_revision": 0,
        "layers": {
            "full_voyage": layer,
            "main_corridor_24_72h": layer,
            "rolling_0_24h": layer,
            "executable_0_6h": layer,
        },
    }


def test_load_v3_group_groups_four_layers(tmp_path) -> None:
    path = tmp_path / "v3.json"
    path.write_text(json.dumps(_document()), encoding="utf-8")
    view = load_v3_group(path)
    assert view.is_complete
    assert view.route_count == 12
    assert {layer.layer_id for layer in view.layers} == {
        "full_voyage",
        "main_corridor_24_72h",
        "rolling_0_24h",
        "executable_0_6h",
    }


def test_load_v3_group_rejects_missing_layer(tmp_path) -> None:
    document = _document()
    del document["layers"]["rolling_0_24h"]
    path = tmp_path / "v3.json"
    path.write_text(json.dumps(document), encoding="utf-8")
    with pytest.raises(DisplayValidationError, match="four layers"):
        load_v3_group(path)


def test_load_v3_group_rejects_invalid_schema(tmp_path) -> None:
    path = tmp_path / "v3.json"
    path.write_text(json.dumps({"nope": True}), encoding="utf-8")
    schema = tmp_path / "schema.json"
    schema.write_text(
        json.dumps(
            {
                "type": "object",
                "required": ["layers"],
                "properties": {"layers": {"type": "object"}},
            }
        ),
        encoding="utf-8",
    )
    with pytest.raises(DisplayValidationError, match="schema errors"):
        load_v3_group(path, schema_path=schema)
