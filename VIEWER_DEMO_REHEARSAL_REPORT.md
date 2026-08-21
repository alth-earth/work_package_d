# Viewer Demo Rehearsal & Presentation Freeze Report

（2026-08-21 12:20 +08:00）

## 1. Key Delta

| Claim | Before this round | After this round | Evidence | Verdict |
|---|---|---|---|---|
| Vessel presentation | Ship icon and authoritative track | Ship icon plus a bounded 2-hour timeline-derived trail and Simulation-Clock-bound wake | Firefox screenshots and `stateAt().trail` | `BROWSER_E2E_PASS` |
| Route transition | Correct but static MVP | Pending route fades in after decision; adopted route receives a non-semantic transition pulse | 13:00/13:30/15:00 Firefox state and proof | `BROWSER_E2E_PASS` |
| Presentation Mode | Clean default with some gate metadata visible | Default hides debug panel, L1/L2/preflight badges, and revision numbers while retaining Engineering Debug toggle | DOM mode assertions and screenshots | `BROWSER_E2E_PASS` |
| Ship motion | Continuous backend/timeline motion | Motion contract unchanged; visual wake is derived from `simulation_time`, never CSS or pixel velocity | 300 ms Play smoke: latitude delta `0.0007567°` | `REAL_E2E_PASS` |
| Risk/horizon | Current/+6h/+12h/+24h established | Regression remains green; no risk or hard-reason semantics changed | Firefox horizon and unavailable checks | `FROZEN_BASELINE` |
| Backend scope | A/B/C/contracts/replay frozen | No backend or authoritative contract files changed | Git matrix and diff review | `PRESERVED` |

## 2. Delivered files

Changed in D:

- `viewer/app.js` — recent vessel trail, clock-bound route transition visual
  states, default presentation metadata hiding, and Simulation-Clock-bound
  ship wake.
- `viewer/index.html` — trail legend and layer-control wording.
- `viewer/style.css` — trail legend styling.
- `CURRENT_BASELINE.md` — pre-change baseline captured before code edits.
- `DEMO_REHEARSAL.md` — three-minute operator script.
- `VIEWER_DEMO_REHEARSAL_REPORT.md` — this report.

Orchestrator presentation export was not changed this round. No new bundle was
generated; the existing artifact was reused.

## 3. Backend and frozen-boundary audit

Not modified:

- `work_package_a`
- `work_package_b`
- `work_package_c`
- `arctic_route_contracts`
- replay/navigation/planner/risk/ETA semantics
- authoritative route geometry and backend vessel position calculation
- Orchestrator export code

D remains the sole Viewer runtime owner. The new trail samples the existing
timeline vessel positions and the transition/wake layers only affect drawing.
There is no websocket, real-time service, independent risk timer, CSS infinite
animation, or multi-process synchronization change.

## 4. Browser E2E

Browser: Firefox, Playwright CLI, local D server at
`http://127.0.0.1:8131/index.html`.

Verified in a clean final Firefox session:

- Page loaded; GEBCO basemap, risk overlay, hard layer, route, completed track,
  vessel icon, legend, and controls were visible.
- Presentation Mode was the default (`body[data-mode]=presentation`), with
  debug panel and gate badges hidden. Engineering Debug toggled on and back
  successfully.
- Play/Pause worked. During a 300 ms Play interval, vessel latitude changed
  from `70.3333333` to `70.3340900`; the control changed `Play → Pause → Play`.
- Timeline sample positions remained continuous: `10:00=70.3333`,
  `10:30=70.4135`, `11:00=70.4938`.
- The presentation trail grew from 1 point at 10:00 to 31 points at 10:30,
  61 points at 11:00, and 121 points at the two-hour window cap.
- Horizon controls accepted Current, +6h, +12h, and +24h. Changing horizon
  did not change Simulation Clock or vessel latitude. At 10:30, +24h remained
  `UNAVAILABLE` rather than reusing a stale frame.
- At 13:00: active=1, pending=2, pending alpha=`0.2`.
- At 13:30: active=1, pending=2, pending alpha=`0.92`; Presentation Mode
  said “New route pending · current route remains authoritative”.
- At 15:00: active=2, pending=3, adoption pulse=`1`; Presentation Mode said
  “New route adopted · authoritative route updated”. This correctly preserves
  the same-tick adoption plus next-decision ordering.
- Speed controls selected all four values: 1x, 2x, 4x, 8x. Risk layer toggle
  and mode toggle were also operated.
- Final clean-session console result: errors `0`, warnings `0`.
- Final clean-session static requests: `index.html`, `style.css`, `app.js`,
  `bundle.json`, `favicon.svg`, and `gebco_basemap.png` all HTTP `200`.

## 5. Screenshots / proof

Runtime-only proof files (not Git-tracked):

- [Current risk at 10:30](/root/my_project/.runtime/viewer-proof/demo-current-10-30.png)
- [Pending route at 13:30](/root/my_project/.runtime/viewer-proof/demo-pending-13-30.png)
- [Adopted route at 15:00](/root/my_project/.runtime/viewer-proof/demo-adopted-15-00.png)
- [Fail-closed +24h at 10:30](/root/my_project/.runtime/viewer-proof/demo-unavailable-plus24-10-30.png)

The screenshots show the same GEBCO projection and route/risk layers; the
pending and adopted route visuals are presentation-only overlays.

## 6. Tests

| Check | Result | Level |
|---|---:|---|
| D `pytest -q` | 54 passed | `UNIT_PASS` |
| D Ruff (`viewer tests`) | clean | `UNIT_PASS` |
| `node --check viewer/app.js` | pass | `SMOKE_PASS` |
| Orchestrator `tests/unit/test_replay_viewer_export.py` | 5 passed | `UNIT_PASS` |
| Orchestrator Ruff (`scripts/replay_viewer_export.py`) | clean | `SMOKE_PASS` |
| Firefox product smoke | pass | `BROWSER_E2E_PASS` |
| 12-hour authoritative determinism twin-run | inherited, not rerun | `AUTHORITATIVE_PASS` / `FROZEN_BASELINE` |
| Heavy integration/replay | not rerun | presentation-only change; no semantic trigger |

## 7. Performance and elapsed-time analysis

These are engineering observations from one local Firefox session, not a
professional benchmark.

### Viewer load and payload

| Measurement | Result |
|---|---:|
| DOMContentLoaded | ≈188 ms |
| load event | ≈192 ms |
| `bundle.json` encoded | 1,435,891 B |
| `app.js` encoded | 27,426 B |
| `style.css` encoded | 4,618 B |
| GEBCO PNG encoded | 13,938 B |
| Risk frames/cells consumed | 13 frames / 341 cells per frame |

Compared with the previous polish baseline, the bundle is unchanged; the
Viewer JS grew for trail, transition, and wake presentation logic. No visible
multi-second render or horizon/scrub freeze was observed. The trail scans only
the bounded two-hour timeline window rather than raw weather grids, and risk
rendering remains presentation-ready cell consumption without browser-side B
recalculation.

### Project execution timing

No heavy replay or full integration was launched in this round. The prior
authoritative timing facts remain separate from Viewer load timing:

- latest-head authoritative 12h replay/determinism baseline: ≈2044.9 s,
  ≈34.1 min, inherited and not rerun;
- previous full integration suite: ≈2495.25 s, ≈41:35;
- recent product-round integration suite: ≈2334.71 s, ≈38:54, inherited and
  not rerun here.

These numbers are not Viewer browser load times and are not combined into one
performance claim.

## 8. Unexpected findings and resolutions

1. The first browser launch attempted the unavailable default Chromium path;
   the environment did have Firefox, and the required Firefox E2E completed
   successfully. The final clean Firefox session is the reported browser
   evidence.
2. At 15:00 the timeline field `effective_adoption` describes the next
   pending plan. The initial presentation pulse therefore did not appear even
   though active route state was correct. The presentation layer was corrected
   to use the already-emitted `REPLAN_ADOPTED` event time. No business state
   was changed.
3. The coarse risk grid remains the previously audited B target-grid output.
   This round intentionally did not change B resolution or interpolate risk
   values.
4. The visible route is predominantly northbound in this artifact, so the
   browser heading evidence is approximately `0°`; heading still comes from
   the active route segment bearing.

## 9. Git state and commits

| Repository | Branch | Start HEAD | End state |
|---|---|---|---|
| root | `demo-engineering` | `3812b5d16776718b590af468594c7fdbb1f36041` | unchanged; expected nested D entry only |
| governance | `demo-engineering` | `234573d8caeadf4be2199d93f575f0594601298b` | unchanged, clean |
| contracts | `demo-engineering` | `7e831822781c56f4537785ca59b306f78a54a568` | unchanged, clean |
| orchestrator | `demo-engineering` | `b83320621318bc4eb57ae6a49d5a3cd400684acf` | unchanged, clean |
| A | `demo-engineering` | `c6d0718ceecb2b62bfaf89aeaebc00837f5f0dea` | unchanged, clean |
| B | `demo-engineering` | `62694205fd6dfc8242c67650a5a3128847a2f72f` | unchanged, clean |
| C | `demo-engineering` | `42e951c480aa1bca1684706909c87b016c28e03c` | unchanged, clean |
| D | `demo-engineering` | `d36f6477245944a4847d8f009d4155e46330841a` | implementation commit `a3dcc3f6b7dbbf0134d667024710e0e886f88864`; report commit follows |

All package branches were equal to their upstream at the start. No push,
force-push, reset, rebase, or frozen-branch operation was performed. Root
`.git` was untouched.

## 10. Remaining NEXT

No further product code is required for this rehearsal round. The remaining
step is human demo rehearsal using `DEMO_REHEARSAL.md`, including operator
timing and recovery practice, followed by a human-reviewed final freeze/tag
decision. The B-owned coarse grid and existing technical debt remain out of
scope.

## Final verdict

```text
DEMO_FREEZE_CANDIDATE = YES
```

The Viewer is ready for human demo rehearsal on the frozen artifact. Final
freeze remains a deliberate human decision; this report does not start the
next freeze round automatically.
