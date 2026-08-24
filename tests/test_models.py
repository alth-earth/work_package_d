from arctic_route_display.models import (
    DisplayState,
    LayerView,
    RouteSetView,
    SelectionRationaleView,
    TradeoffsView,
)


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


def _rationale(run_id: str = "run-1") -> SelectionRationaleView:
    return SelectionRationaleView(
        schema_version="selection-rationale.v1",
        run_id=run_id,
        scenario_id="scenario-1",
        corridor_id="corridor-1",
        vessel_profile_id="vessel-1",
        generation_id=0,
        input_revision=0,
        selected_plan_id="recommended-1",
        baseline_plan_id="fastest-1",
        selected_objective="recommended",
        baseline_objective="fastest",
        tradeoffs=TradeoffsView(
            delta_distance_km=0.4,
            delta_eta_hours=0.24,
            delta_avg_risk=-0.01,
            delta_max_risk=-0.001,
            delta_integrated_risk_hours=-0.64,
            avg_risk_reduction_pct=2.96,
            max_risk_reduction_pct=0.14,
        ),
        summary_text="推荐路线平均风险减少 3.0%",
    )


def test_display_state_attaches_selection_rationale() -> None:
    state = DisplayState()
    state.set_selection_rationale(_rationale())
    assert state.selection_rationale is not None
    assert state.selection_rationale.selected_objective == "recommended"
    assert state.status == "empty"


def test_display_state_warns_on_rationale_run_id_mismatch() -> None:
    state = DisplayState()
    state.publish_v3(_group("g1"))
    state.set_selection_rationale(_rationale(run_id="other-run"))
    assert "rationale_run_id_mismatch" in state.warnings
    assert state.selection_rationale is not None


def test_display_state_rejects_invalid_rationale_schema() -> None:
    rationale = _rationale()
    rationale = SelectionRationaleView(
        schema_version=rationale.schema_version,
        run_id=rationale.run_id,
        scenario_id=rationale.scenario_id,
        corridor_id=rationale.corridor_id,
        vessel_profile_id=rationale.vessel_profile_id,
        generation_id=rationale.generation_id,
        input_revision=rationale.input_revision,
        selected_plan_id=rationale.selected_plan_id,
        baseline_plan_id=rationale.baseline_plan_id,
        selected_objective=rationale.selected_objective,
        baseline_objective=rationale.baseline_objective,
        tradeoffs=rationale.tradeoffs,
        summary_text=rationale.summary_text,
    )
    # schema_version lives on the view; simulate a stale version by rebuilding
    # through the loader path instead of mutating a frozen dataclass.
    import dataclasses

    stale = dataclasses.replace(rationale, schema_version="selection-rationale.v0")
    state = DisplayState()
    state.set_selection_rationale(stale)
    assert "rejected_invalid_rationale_schema" in state.warnings
    assert state.selection_rationale is None
