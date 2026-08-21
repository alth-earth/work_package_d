# Arctic Route Viewer — 3-Minute Demo Rehearsal

（2026-08-21 12:05 +08:00）

This runbook is for the offline deterministic artifact
`sb-viewer-baseline-12h-det`. It is a presentation rehearsal, not a live
navigation or real-time weather service.

## Preflight

1. Start the D static Viewer from `work_package_d`:

   ```bash
   .venv/bin/python scripts/replay_viewer_serve.py --root viewer --port 8131
   ```

2. Open `http://127.0.0.1:8131/index.html` in Firefox.
3. Confirm the page opens in Presentation Mode, the GEBCO map is visible, and
   the required gate badges are PASS. Keep Risk, Hard/availability, Routes,
   and Track layers enabled.
4. Set the scrubber to `10:00` if the page has already advanced. Use Current
   risk for the main story; use +6h and +24h only at the marked horizon step.

## Three-minute script

| Time | Operator action | What the audience sees | Capability demonstrated |
|---|---|---|---|
| 0:00 | Point to the map and the Simulation Clock. | Real GEBCO basemap, risk/hard overlays, route, vessel icon, and clean Presentation Mode. | The Viewer consumes a deterministic replay artifact with one presentation clock. |
| 0:20 | Press **Play** and leave speed at 2x. Pause near `10:30`. | The ship moves continuously; the short pale trail follows its actual recent path. | Vessel motion comes from timeline/ETA plus Simulation Clock; the trail is presentation-only. |
| 0:50 | Select **+6h** in the risk horizon control. | The ship remains at the same simulation time while the risk panel shows the requested and actual risk valid time. | Forecast presentation horizon is independent of vessel time. |
| 1:20 | Select **Current**, then scrub to `13:00` and briefly resume/stop. | The current risk frame updates with simulation time while the route remains readable. | Risk, vessel, route, and event rendering share one clock. |
| 1:40 | Scrub to `13:30`. | “New route pending · current route remains authoritative”; the pending route is visibly dashed/amber and has faded in. | `REPLAN_DECIDED` is not adoption; the active route and completed history are preserved. |
| 2:10 | Scrub to `15:00`. | “New route adopted · authoritative route updated”; the new active route is blue and the transition pulse is visible. A later pending plan may also be visible because the artifact contains same-tick follow-up planning. | `REPLAN_ADOPTED` changes the active future route at the effective time. |
| 2:40 | Let the ship sit at `15:00` or press Play for a few seconds; point to the risk and route legends. | Ship icon, wake/trail, route states, risk levels, and hard-reason states remain distinct. | Presentation foundation is demo-ready without hiding unknown or hard constraints. |
| 3:00 | Stop playback. Optionally click **Engineering Debug** to show provenance and revision details, then return to Presentation Mode. | Clean competition view is restored; debug remains available on demand. | Presentation and engineering inspection are separate modes. |

## Optional proof moments

- At `10:30`, choose `+24h` to show `unavailable`; do not describe it as a
  low-risk forecast. The formal artifact ends at `22:00Z`, so the Viewer fails
  closed rather than reusing a stale frame.
- At `13:30`, the active route must still be revision 1 in Engineering Debug,
  with revision 2 pending.
- At `15:00`, Engineering Debug may show active revision 2 and pending
  revision 3 because adoption and a new decision occur at the same tick.

## Recovery cues

- If playback passes a target moment, drag the scrubber; this pauses playback
  without changing the authoritative timeline.
- If the right panel is too dense for narration, remain in Presentation Mode;
  do not disable Hard/availability merely to simplify the screenshot.
- If Firefox is restarted, reload the same local URL and reuse the frozen
  bundle. Do not regenerate a new replay during the rehearsal.
