# Environment Layer Readiness

（2026-08-21 17:15 +08:00）

## Audit scope

This is a read-only audit of the frozen Viewer bundle and the existing replay
snapshot payloads. It does not read A private data at runtime and does not
change A, B, C, or the contracts package.

## Current artifact result

The current `replay.viewer-bundle.v1` contains:

| Capability | Published presentation data | Viewer status |
|---|---|---|
| Total risk | `risk.frames[].risk_levels`, scores, summaries | AVAILABLE |
| Hard / availability | `risk.frames[].hard_reasons` | AVAILABLE |
| Sea ice concentration | no presentation array | NOT_READY |
| Wind | no presentation array | NOT_READY |
| Wave | no presentation array | NOT_READY |
| Ocean current | no presentation array | NOT_READY |
| Temperature | no presentation array | NOT_READY |
| Per-cell risk contributors | no contributor fields | NOT_READY |

The snapshots contain planning, coverage, and provenance metadata, but these
are not equivalent to display-ready environmental grids. The Viewer therefore
does not infer or reconstruct environmental layers from them.

## Required future presentation contract

An environment layer can be added safely only when Orchestrator exports a
backward-compatible presentation field with at least:

```text
layer_id
source_schema
valid_time
simulation_time_selection
availability
reason
coordinates / canonical geographic transform
values or compact cells
units
provenance
```

Each factor must remain separate from total risk and hard availability. Missing
or unavailable factor data must remain visibly unavailable; it must not become
a green or low-risk layer.

## Decision

```text
ENVIRONMENT_LAYER_READINESS = NOT_READY
```

This is an artifact-contract gap, not a D rendering defect. Keep the current
Viewer boundary and do not add synthetic Sea Ice/Wind/Wave/Current/Temperature
layers for the competition demo.
