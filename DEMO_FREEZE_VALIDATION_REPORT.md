# Demo Freeze Validation Report

（2026-08-21 17:00 +08:00）

## Verdict

```text
DEMO_FREEZE_VALIDATION = PASS
DEMO_FREEZE = YES
```

This validation uses the existing formal artifact
`sb-viewer-baseline-12h-det`; it does not regenerate replay data.

## Artifact and launch

- Source artifact:
  `${ARCTIC_ROUTE_ROOT}/work_package_a/data/output/rc2-smoke/causal-replay-mvp/sb-viewer-baseline-12h-det/`
- Viewer package: `work_package_d/viewer/`
- Schema: `replay.viewer-bundle.v1`
- Launch command:

  ```bash
  cd ${ARCTIC_ROUTE_ROOT}/work_package_d
  .venv/bin/python scripts/replay_viewer_serve.py \
    --root viewer --host 127.0.0.1 --port 8131
  ```

- Independent-copy check: the complete `viewer/` directory was copied to
  `${ARCTIC_ROUTE_ROOT}/.runtime/freeze-copy-20260821/` and served on port 8132.
  The copied package loaded without source-repository imports or additional
  runtime services.

## Firefox validation

Browser: Firefox through Playwright CLI, local static server.

Verified on the source package and the independent copied package:

- page loads with GEBCO basemap and `L1 PASS / L2 PASS` gates;
- default Presentation Mode, debug panel hidden, paused at replay departure;
- Current risk, 13-frame Risk Forecast Timeline, and four replay milestones;
- route, completed track, hard/availability layer, and vessel are visible;
- Play/Pause advances the shared Simulation Clock and the vessel moves;
- required static resources return HTTP 200;
- console errors: 0; console warnings: 0.

The current default speed selection is 2x; it does not affect the paused-at-
departure freeze state or physical vessel speed semantics.

## Evidence and risk items

Proof screenshot:

- `.runtime/viewer-proof/freeze-validation-default.png`

Remaining product limitations are not freeze blockers for the current demo:

- multi-objective candidate routes are not present in the bundle;
- single-factor environment arrays and contributor fields are not present;
- the risk grid remains the formal coarse target grid and is not interpolated;
- 12h determinism is inherited from the frozen baseline and was not rerun.

These limitations are documented as data/contract readiness items. No Viewer
fallback fabricates them.

## Frozen boundary

No A, B, C, or `arctic_route_contracts` files were changed. Risk formula,
risk-level policy, route semantics, ETA, ship motion, replay timing, and
adoption semantics remain authoritative and unchanged.
