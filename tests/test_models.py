from arctic_route_display.models import DisplayState, LayerView, RouteSetView


def _layer(layer_id: str) -> LayerView:
    return LayerView(
        layer_id=layer_id,
        objectives=("fastest", "low_risk", "recommended"),
        plans=({"id": f"{layer_id}-1"}, {"id": f"{layer_id}-2"}, {"id": f"{layer_id}-3"}),
    )


def _group(group_id: str = "g1") -> RouteSetView:
    return RouteSetView(
        schema_version="cd.four-layer-route-plan-set.v3",
        group_id=group_id,
        run_id="run-1",
        scenario_id="scenario-1",
        generation_id=0,
        input_revision=0,
        layers=tuple(
            _layer(layer_id)
            for layer_id in (
                "full_voyage",
                "main_corridor_24_72h",
                "rolling_0_24h",
                "executable_0_6h",
            )
        ),
    )


def test_group_is_complete_when_four_layers_with_three_plans() -> None:
    assert _group().is_complete
    assert _group().route_count == 12


def test_display_state_keeps_previous_complete_group() -> None:
    state = DisplayState()
    state.publish_v3(_group("g1"))
    state.publish_v3(_group("g2"))
    assert state.status == "complete"
    assert state.latest_complete is not None and state.latest_complete.group_id == "g2"
    assert state.previous_complete is not None and state.previous_complete.group_id == "g1"


def test_display_state_rejects_incomplete_group() -> None:
    incomplete = _group("bad")
    incomplete = RouteSetView(
        schema_version=incomplete.schema_version,
        group_id=incomplete.group_id,
        run_id=incomplete.run_id,
        scenario_id=incomplete.scenario_id,
        generation_id=incomplete.generation_id,
        input_revision=incomplete.input_revision,
        layers=incomplete.layers[:2],
    )
    state = DisplayState()
    state.publish_v3(incomplete)
    assert state.status == "empty"
    assert "rejected_incomplete_v3_group" in state.warnings
