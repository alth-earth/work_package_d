# Competition Demo Freeze Validation Report

（2026-08-21 17:30 +08:00）

## 1. Key Delta

| Claim | Before | After | Evidence | Verdict |
|---|---|---|---|---|
| Demo freeze validation | Previous browser baseline | Fresh source-package and independent-copy Firefox validation | `DEMO_FREEZE_VALIDATION_REPORT.md`, Firefox | PASS |
| Risk explanation | Timeline only | Risk Summary: mean/max, trend, LAND, unavailable, hard-cell counts | current bundle + Firefox panel | PASS |
| C route explanation | Route status only | Route Decision: active/pending revision, distance, ETA, published metrics, event trace | Firefox 13:30/15:00 | PASS |
| Multi-route comparison | No real candidate set | `route_candidates` interface present, empty and explicit | `bundle.json` | SAFE DEFER |
| Environment factors | No readiness statement | readiness report records absent fields and required future contract | `ENVIRONMENT_LAYER_READINESS.md` | NOT_READY / HONEST |
| Demo rehearsal | Existing 3-minute flow | Summary and Route Decision narration added | `DEMO_REHEARSAL.md` | PASS |

```text
DEMO_FREEZE = YES
```

This verdict applies to the current deterministic offline artifact and does
not claim that absent candidate routes or absent environmental factor arrays
have been implemented.

## 2. Frozen boundary and artifact

- Formal artifact:
  `/root/my_project/work_package_a/data/output/rc2-smoke/causal-replay-mvp/sb-viewer-baseline-12h-det/`
- Viewer package: `/root/my_project/work_package_d/viewer/`
- Bundle schema: `replay.viewer-bundle.v1`
- Timeline: 721 one-minute entries, 2026-08-15 10:00Z–22:00Z
- Risk: 13 hourly `presentation.risk-overlay.v1` frames, 31×11=341 cells
- D remains the sole Viewer runtime owner.
- Orchestrator remains the presentation export/preflight owner.

Unchanged and not modified:

```text
work_package_a
work_package_b
work_package_c
arctic_route_contracts

B risk formula and level policy
C planner core and route semantics
ETA and vessel motion semantics
replay timeline and event semantics
deferred adoption and completed-track semantics
```

## 3. Freeze validation

The source package was served with:

```bash
cd /root/my_project/work_package_d
.venv/bin/python scripts/replay_viewer_serve.py \
  --root viewer --host 127.0.0.1 --port 8131
```

For copy independence, the complete `viewer/` directory was copied to
`/root/my_project/.runtime/freeze-copy-final-20260821/` and served on port
8133. The copy loaded without source-repository imports or additional services.

Fresh Firefox checks on the final copied package confirmed:

- Presentation Mode is default; Engineering Debug is hidden;
- page is paused at replay departure (`10:00`, Play button visible);
- GEBCO basemap, risk/hard layers, route, completed track, ship,
  Risk Forecast Timeline, Risk Summary, Route Decision, and milestones exist;
- required static resources (`index.html`, `style.css`, `app.js`, `bundle.json`,
  `favicon.svg`, `gebco_basemap.png`) all return HTTP 200;
- console errors = 0; console warnings = 0.

## 4. Risk Summary

The panel consumes only Orchestrator-exported metadata. It does not scan raw
weather data or recalculate B risk.

At Current / 10:00:

```text
mean score              0.055984
maximum score           0.151060
forecast trend          decreasing
LAND cells              65
DATA_UNAVAILABLE cells  21
hard cells total        86
published cells         341
```

The forecast trend is an export-layer descriptive summary using the first to
last finite published mean score: `0.047120 - 0.055984 = -0.008863`. It is not
a new risk calculation or threshold policy.

The panel explicitly explains that Level 1 on published `NONE` water cells is
a low-risk assessment. `LAND` and `DATA_UNAVAILABLE` remain separate hard /
availability semantics and are never rendered as safe.

## 5. Route Decision

The panel uses the published route revisions and event list:

```text
Initial:
  R1 authoritative
  distance = 909.7 km
  arrival ETA = 2026-08-17T12:27:16.172062Z
  average/max risk = not published

13:30:
  REPLAN_DECIDED
  active R1, pending R2
  R1 remains authoritative

15:00:
  REPLAN_ADOPTED R2
  active R2, pending R3
  event trace preserves the artifact ordering:
  REPLAN_ADOPTED R2 → REPLAN_DECIDED R3
```

The panel does not turn route revisions into Fastest/Low Risk/Recommended
candidate comparisons. The current bundle adds:

```json
"route_candidates": {
  "schema_version": "presentation.route-candidates.v1",
  "status": "NOT_PUBLISHED",
  "candidates": []
}
```

The Viewer therefore keeps the single authoritative route and states that
candidate comparison is unavailable.

## 6. Environment layer readiness

[ENVIRONMENT_LAYER_READINESS.md](ENVIRONMENT_LAYER_READINESS.md) records the
read-only audit. The current presentation bundle has no display-ready arrays
for Sea Ice, Wind, Wave, Ocean Current, Temperature, or per-cell contributors.
No synthetic factor layer was added.

Future factor layers require a presentation contract containing valid time,
selection/availability, canonical coordinates, units, provenance, and explicit
fail-closed behavior. Total risk and individual factors must remain separate.

## 7. Demo rehearsal

[DEMO_REHEARSAL.md](DEMO_REHEARSAL.md) now narrates:

```text
map and clock
→ continuous ship motion
→ +6h risk summary / valid time
→ current risk at 13:00
→ R2 pending at 13:30
→ R2 adopted and R3 pending at 15:00
→ summary, route decision, milestones, and debug toggle
```

The operator should not claim that the current artifact contains a three-way
objective comparison or single-factor environmental contributors.

## 8. Modified files

### D

- `viewer/index.html`
- `viewer/app.js`
- `viewer/style.css`
- `tests/unit/test_replay_viewer_bundle.py`
- `DEMO_REHEARSAL.md`
- `README.md`
- `HANDOFF.md`
- `CHANGELOG.md`
- `scripts/risk_distribution_audit.py` and its existing audit report remain
  part of the product evidence;
- `DEMO_FREEZE_VALIDATION_REPORT.md`
- `ENVIRONMENT_LAYER_READINESS.md`
- this report.

### Orchestrator

- `scripts/replay_viewer_export.py`
- `tests/unit/test_replay_viewer_export.py`
- `README.md`
- `CHANGELOG.md`
- regenerated `work_package_d/viewer/bundle.json` from the existing manifest;
  no replay was executed.

Runtime screenshots are stored under
`/root/my_project/.runtime/viewer-proof/` and are not intended as Git inputs.

## 9. Tests and validation levels

| Check | Result | Level |
|---|---:|---|
| D full pytest | 58 passed | `UNIT_PASS` |
| D Ruff | clean | `UNIT_PASS` |
| `node --check viewer/app.js` | pass | `SMOKE_PASS` |
| Orchestrator focused export tests | 7 passed | `UNIT_PASS` |
| Orchestrator export Ruff | clean | `SMOKE_PASS` |
| Existing artifact export | preflight PASS, L2 PASS, timeline 721 | `REAL_ARTIFACT_HTTP_SMOKE_PASS` |
| Source package Firefox | map/UI/controls/state checks pass | `BROWSER_E2E_PASS` |
| Independent copied package Firefox | same checks pass | `BROWSER_E2E_PASS` |
| 13:30 route state | active R1, pending R2 | `REAL_E2E_PASS` |
| 15:00 route state | active R2, pending R3 | `REAL_E2E_PASS` |
| 12h determinism twin-run | inherited, not rerun | `AUTHORITATIVE_PASS` / `FROZEN_BASELINE` |

Browser motion evidence on the final copied package:

```text
10:00 latitude = 70.3333333
350ms Play at 1x latitude = 70.3338017
delta = +0.0004684 degrees
button sequence = Play → Pause → Play
pixel speed = NO
```

The position remains timeline/backend ETA plus Simulation Clock.

## 10. Performance and elapsed analysis

These are WSL local observations, not a professional benchmark.

### Browser/package

Final copied-package Firefox warm navigation observation:

| Metric | Observation |
|---|---:|
| DOMContentLoaded | 27 ms |
| load event | 28 ms |
| `bundle.json` encoded body | 1,442,876 B |
| `app.js` encoded body | 43,718 B |
| `style.css` encoded body | 7,681 B |
| GEBCO PNG encoded body | 13,938 B |
| risk frames/cells | 13 / 341 |
| horizon switch | no visible freeze; vessel clock unchanged |

The added summary metadata is small relative to the bundle. The browser still
consumes presentation-ready summaries and does not process raw grids every
animation frame.

### This round commands

- presentation export from existing manifest/snapshots: 1.92 s wall time,
  maximum RSS 141,820 KB;
- D pytest: 1.11 s;
- Orchestrator focused tests: 0.34 s;
- no heavy replay, 12h twin-run, 24h replay, or full integration was started.

Historical replay/integration timings remain inherited baselines and are not
mixed with Viewer load time:

- authoritative 12h baseline: about 2044.9 s / 34.1 min, inherited;
- prior full integration suite: about 2495.25 s / 41:35, inherited;
- recent product integration suite: about 2334.71 s / 38:54, inherited.

## 11. Git and freeze state

No commit, reset, rebase, merge, or push was performed.

Start and end HEAD for this round are unchanged:

| Repository | Branch | Start = End HEAD | Final state |
|---|---|---|---|
| governance | `demo-engineering` | `234573d` | clean |
| contracts | `demo-engineering` | `7e83182` | clean |
| orchestrator | `demo-engineering` | `a404564` | dirty, presentation export/docs/tests only |
| A | `demo-engineering` | `c6d0718` | clean |
| B | `demo-engineering` | `6269420` | clean |
| C | `demo-engineering` | `42e951c` | clean |
| D | `demo-engineering` | `9ccabba` | dirty, Viewer/docs/tests/report only |

The actual filesystem currently has no `/root/my_project/.git` directory;
the nested package repositories above are the Git repositories used for this
round. No Git state was written.

```text
PUSH = NOT PERFORMED
```

## 12. Remaining limitations and competition recommendation

Remaining limitations:

1. No real candidate geometry/metrics for Fastest, Low Risk, and Recommended
   comparison.
2. No presentation-ready Sea Ice/Wind/Wave/Current/Temperature arrays.
3. No contributor-backed risk explanation beyond published frame summaries and
   hard-reason counts.
4. Formal risk grid remains coarse by design; no D interpolation changes its
   semantics.

Competition recommendation:

- demonstrate the causal chain, Risk Summary, continuous vessel motion, and
  deferred replan adoption;
- use the explicit unavailable state as evidence of fail-closed behavior if
  asked about forecast range;
- do not claim multi-objective route comparison or environmental factor layers
  for this artifact;
- freeze the current demo package for the competition rehearsal.

```text
DEMO_FREEZE = YES
```
