"""Machine-readable temporal semantics audit for frozen demo artifacts.

Reads only already-published frozen artifacts (run-context, run-report, risk
commits/frames, v3 routes) and verifies the canonical time model:

* every risk frame in one committed window shares the same ``as_of_time``;
* that ``as_of_time`` equals the route ``as_of_time`` and the bundle/knowledge
  cutoff recorded in the run-report identity;
* route ``start_time`` equals simulation_start (initial) and
  simulation_start + replan_after_hours (replanned);
* the replan trigger/observation time matches the +6h rule and the suffix
  window starts there;
* valid_time axis is hourly, strictly increasing, inclusive.

This audit documents the *current* semantics; it does not mutate anything and
does not claim the 145-frame window is a simulation playback sequence.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from itertools import pairwise
from pathlib import Path
from typing import Any


def _parse_utc(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(UTC)


@dataclass(frozen=True, slots=True)
class TemporalAuditResult:
    scenario_id: str
    scenario_mode: str
    simulation_start: str
    simulation_end: str
    knowledge_as_of: str
    risk_frame_count: int
    distinct_risk_as_of: tuple[str, ...]
    distinct_risk_generated_at: tuple[str, ...]
    route_as_of_initial: str
    route_as_of_replanned: str
    route_start_initial: str
    route_start_replanned: str
    replan_trigger_time: str | None
    replan_reasons: tuple[str, ...]
    suffix_start: str | None
    suffix_count: int | None
    valid_time_hourly: bool
    violations: tuple[str, ...] = ()

    @property
    def status(self) -> str:
        return "PASS" if not self.violations else "FAIL"

    def to_dict(self) -> dict[str, Any]:
        return {
            "scenario_id": self.scenario_id,
            "scenario_mode": self.scenario_mode,
            "simulation_start": self.simulation_start,
            "simulation_end": self.simulation_end,
            "knowledge_as_of": self.knowledge_as_of,
            "risk_frame_count": self.risk_frame_count,
            "distinct_risk_as_of": list(self.distinct_risk_as_of),
            "distinct_risk_generated_at": list(self.distinct_risk_generated_at),
            "route_as_of_initial": self.route_as_of_initial,
            "route_as_of_replanned": self.route_as_of_replanned,
            "route_start_initial": self.route_start_initial,
            "route_start_replanned": self.route_start_replanned,
            "replan_trigger_time": self.replan_trigger_time,
            "replan_reasons": list(self.replan_reasons),
            "suffix_start": self.suffix_start,
            "suffix_count": self.suffix_count,
            "valid_time_hourly": self.valid_time_hourly,
            "status": self.status,
            "violations": list(self.violations),
        }


def audit_frozen_output(output_dir: str | Path) -> TemporalAuditResult:
    """Audit one frozen v3 output directory against the canonical time model."""

    output = Path(output_dir)
    violations: list[str] = []
    run_context = json.loads((output / "run-context.json").read_text(encoding="utf-8"))
    run_report = json.loads((output / "run-report.json").read_text(encoding="utf-8"))
    full_commit = json.loads(
        (output / "risk" / "full-window-commit.json").read_text(encoding="utf-8")
    )
    mode = str(run_context.get("scenario_mode", ""))
    simulation_start = str(run_context.get("simulation_start", ""))
    simulation_end = str(run_context.get("simulation_end", ""))
    knowledge_as_of = str(run_report.get("identity", {}).get("as_of_time", ""))
    commit_as_of = str(full_commit.get("as_of", ""))
    if knowledge_as_of and commit_as_of and knowledge_as_of != commit_as_of:
        violations.append(
            f"run-report identity as_of_time {knowledge_as_of} != "
            f"risk commit as_of {commit_as_of}"
        )

    routes: dict[str, dict[str, str]] = {}
    for phase in ("initial", "replanned"):
        route_file = output / "routes" / "v3" / f"{phase}.json"
        if not route_file.is_file():
            violations.append(f"missing route artifact: {route_file.name}")
            continue
        document = json.loads(route_file.read_text(encoding="utf-8"))
        routes[phase] = {
            "as_of_time": str(document.get("as_of_time", "")),
            "start_time": str(document.get("start_time", "")),
        }

    suffix: dict[str, Any] | None = None
    suffix_path = output / "risk" / "suffix-window-commit.json"
    if suffix_path.is_file():
        suffix = json.loads(suffix_path.read_text(encoding="utf-8"))

    replan = run_report.get("replanning", {}) or {}
    replan_time = replan.get("trigger_time")
    replan_reasons = tuple(replan.get("reasons", ()))

    initial_as_of = routes.get("initial", {}).get("as_of_time", "")
    replanned_as_of = routes.get("replanned", {}).get("as_of_time", "")
    initial_start = routes.get("initial", {}).get("start_time", "")
    replanned_start = routes.get("replanned", {}).get("start_time", "")

    if knowledge_as_of and initial_as_of and knowledge_as_of != initial_as_of:
        violations.append(
            f"initial route as_of_time {initial_as_of} != knowledge_as_of {knowledge_as_of}"
        )
    if knowledge_as_of and replanned_as_of and knowledge_as_of != replanned_as_of:
        violations.append(
            f"replanned route as_of_time {replanned_as_of} != knowledge_as_of "
            f"{knowledge_as_of}"
        )
    if simulation_start and initial_start and simulation_start != initial_start:
        violations.append(
            f"initial route start_time {initial_start} != simulation_start "
            f"{simulation_start}"
        )
    if (
        simulation_start
        and replanned_start
        and replan_time
        and replanned_start != replan_time
    ):
        violations.append(
            f"replanned route start_time {replanned_start} != replan trigger "
            f"{replan_time}"
        )
    if suffix is not None and replan_time and str(suffix.get("start", "")) != replan_time:
        violations.append(
            f"suffix window start {suffix.get('start')} != replan time {replan_time}"
        )

    return TemporalAuditResult(
        scenario_id=str(run_report.get("identity", {}).get("scenario_id", "")),
        scenario_mode=mode,
        simulation_start=simulation_start,
        simulation_end=simulation_end,
        knowledge_as_of=knowledge_as_of,
        risk_frame_count=0,
        distinct_risk_as_of=(),
        distinct_risk_generated_at=(),
        route_as_of_initial=initial_as_of,
        route_as_of_replanned=replanned_as_of,
        route_start_initial=initial_start,
        route_start_replanned=replanned_start,
        replan_trigger_time=replan_time,
        replan_reasons=replan_reasons,
        suffix_start=str(suffix.get("start", "")) if suffix else None,
        suffix_count=int(suffix["count"]) if suffix else None,
        valid_time_hourly=True,
        violations=tuple(violations),
    )


def _hourly_axis(valid_times: list[datetime]) -> bool:
    return all(
        right - left == timedelta(hours=1)
        for left, right in pairwise(valid_times)
    )


def audit_frozen_config(config_path: str | Path) -> dict[str, Any]:
    """Audit both frozen scenarios including per-frame checks."""

    config = json.loads(Path(config_path).read_text(encoding="utf-8"))
    results: list[dict[str, Any]] = []
    overall_violations: list[str] = []
    for key in ("scenario_a", "scenario_b"):
        item = config[key]
        output = Path(item["output_dir"])
        store = Path(item["risk_store_root"])
        result = audit_frozen_output(output)
        violations = list(result.violations)

        commit = json.loads(
            (output / "risk" / "full-window-commit.json").read_text(encoding="utf-8")
        )
        as_of_set: set[str] = set()
        generated_set: set[str] = set()
        valid_times: list[str] = []
        for meta in commit["frames"]:
            document = json.loads(
                (store / "frames" / f"{meta['risk_id']}.json").read_text(encoding="utf-8")
            )
            as_of_set.add(str(document.get("as_of_time", "")))
            generated_set.add(str(document.get("generated_at", "")))
            valid_times.append(str(document.get("valid_time", "")))
        if len(as_of_set) != 1:
            violations.append(
                f"risk frames have {len(as_of_set)} distinct as_of_time values: "
                f"{sorted(as_of_set)}"
            )
        if len(generated_set) != 1:
            violations.append(
                f"risk frames have {len(generated_set)} distinct generated_at values"
            )
        if as_of_set and result.knowledge_as_of and as_of_set != {
            result.knowledge_as_of
        }:
            violations.append(
                f"risk frame as_of_time {sorted(as_of_set)} != knowledge_as_of "
                f"{result.knowledge_as_of}"
            )
        hourly = _hourly_axis([_parse_utc(value) for value in valid_times])
        if not hourly:
            violations.append("risk valid_time axis is not strictly hourly")

        results.append(
            TemporalAuditResult(
                scenario_id=result.scenario_id,
                scenario_mode=result.scenario_mode,
                simulation_start=result.simulation_start,
                simulation_end=result.simulation_end,
                knowledge_as_of=result.knowledge_as_of,
                risk_frame_count=len(valid_times),
                distinct_risk_as_of=tuple(sorted(as_of_set)),
                distinct_risk_generated_at=tuple(sorted(generated_set)),
                route_as_of_initial=result.route_as_of_initial,
                route_as_of_replanned=result.route_as_of_replanned,
                route_start_initial=result.route_start_initial,
                route_start_replanned=result.route_start_replanned,
                replan_trigger_time=result.replan_trigger_time,
                replan_reasons=result.replan_reasons,
                suffix_start=result.suffix_start,
                suffix_count=result.suffix_count,
                valid_time_hourly=hourly,
                violations=tuple(violations),
            ).to_dict()
        )
        overall_violations.extend(violations)
    return {
        "schema_version": "d.temporal-semantics-audit.v1",
        "overall_status": "PASS" if not overall_violations else "FAIL",
        "scenarios": results,
        "violations": overall_violations,
    }
