"""Demo-facing adapter: frozen/live result models, loading, and preflight."""

from arctic_route_display.demo.frozen_loader import (
    FrozenScenarioSource,
    load_frozen_scenario,
)
from arctic_route_display.demo.models import (
    DemoCoverage,
    DemoPhase,
    DemoRoute,
    DemoScenario,
    ResultOrigin,
)

__all__ = [
    "DemoCoverage",
    "DemoPhase",
    "DemoRoute",
    "DemoScenario",
    "FrozenScenarioSource",
    "ResultOrigin",
    "load_frozen_scenario",
]
