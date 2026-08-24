# Viewer Demo Rehearsal Round — Current Baseline

（2026-08-21 11:55 +08:00）

This is the read-only baseline captured before the Demo Rehearsal &
Presentation Freeze Round. It is a current-round record and does not replace
or edit historical governance reports.

## Repository state

| Repository | Branch | HEAD | Working tree |
|---|---|---|---|
| root `${ARCTIC_ROUTE_ROOT}` | `demo-engineering` | `3812b5d16776718b590af468594c7fdbb1f36041` | clean except expected nested `work_package_d/` entry |
| governance | `demo-engineering` | `234573d8caeadf4be2199d93f575f0594601298b` | clean |
| contracts | `demo-engineering` | `7e831822781c56f4537785ca59b306f78a54a568` | clean |
| orchestrator | `demo-engineering` | `b83320621318bc4eb57ae6a49d5a3cd400684acf` | clean |
| work package A | `demo-engineering` | `c6d0718ceecb2b62bfaf89aeaebc00837f5f0dea` | clean |
| work package B | `demo-engineering` | `62694205fd6dfc8242c67650a5a3128847a2f72f` | clean |
| work package C | `demo-engineering` | `42e951c480aa1bca1684706909c87b016c28e03c` | clean |
| work package D | `demo-engineering` | `d36f6477245944a4847d8f009d4155e46330841a` | clean |

All package branches are equal to their configured upstream at baseline.
Push is not part of this round.

## Product and artifact baseline

- Artifact: `work_package_a/data/output/rc2-smoke/causal-replay-mvp/sb-viewer-baseline-12h-det/`
- Viewer input: `work_package_d/viewer/bundle.json`
- Bundle schema: `replay.viewer-bundle.v1`
- Timeline: 721 one-minute samples covering the 12-hour replay window
- Risk frames: 13 hourly frames, `presentation.risk-overlay.v1`
- Risk cells: 341 exact presentation cells per frame (31 × 11 target grid)
- Bundle size: 1,435,891 bytes
- Existing presentation metadata: `presentation.viewer-presentation.v1`

## Viewer behavior already verified

- D is the sole Viewer runtime owner; Orchestrator exports and validates the
  presentation bundle but does not own browser runtime code.
- One Simulation Clock drives vessel position, routes, completed track, risk,
  and events.
- Vessel position is obtained from the timeline/backend ETA interpolation;
  there is no pixel-speed animation.
- Presentation Mode is the current default; Engineering Debug remains
  available through the mode toggle.
- Current/+6h/+12h/+24h risk horizons, fail-closed unavailable behavior,
  separate hard reasons, route layers, Play/Pause, scrub, and 1x/2x/4x/8x
  controls are established.
- At 13:00 and 13:30, active route revision 1 remains authoritative while
  revision 2 is pending. At 15:00, revision 2 is adopted; same-tick later
  planning may expose the next pending revision.
- Firefox Browser E2E previously passed for map, route, risk, hard layer,
  moving ship, horizon selection, deferred adoption, controls, and zero
  console errors/warnings.

## Validation baseline

- D pytest collection: 54 tests
- D Ruff: clean
- `node --check viewer/app.js`: pass
- Orchestrator focused export tests: 5 passed in the prior product round
- Orchestrator fast suite: 78 passed, 2 deselected in the prior product round
- 12-hour authoritative determinism twin-run: inherited; not rerun for this
  presentation-only round

## Frozen boundaries for this round

No changes are permitted to A, B, C, contracts, replay timeline, risk-frame
semantics, route results, ETA contract, or backend ship-position calculation.
Presentation-only changes may be made in D's Viewer. The existing artifact is
reused; no new 12-hour or 144-hour replay is required.
