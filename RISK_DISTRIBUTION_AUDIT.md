# Risk Distribution Audit

> Generated: 2026-08-21T07:17:24.927496Z
> Read-only audit of the exported Viewer presentation bundle; no risk value was recomputed.

## Scope and source

- Bundle: `replay.viewer-bundle.v1` / replay `sb-viewer-baseline-12h-det`
- Scenario: `tromso_isfjorden_august_2026_demo_v1`
- Risk source: `presentation.risk-overlay.v1` / provenance `formal`
- Frames: `13`; cells per frame: `31 × 11 = 341`
- Risk grid resolution: `0.366667° lat × 1.200000° lon`
- Approximate cell size: `40.817333 km lat × 36.820741 km lon at mean latitude`

## Published policy metadata

- B target grid: `0.375° × 1.25°`
- Risk level policy: `c_equal_width_floor_v1`
- Formula version: `deterministic_environment_components_v2`
- Hard-mask policy: `land_sea_mask_threshold_v2`

## Per-frame distribution

| valid_time | L1 | L2 | L3 | L4 | L5 | L1 % | L2 % | L3 % | L4 % | L5 % | score min | score max | score mean | hard reasons |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 2026-08-15T10:00:00Z | 255 | 0 | 0 | 0 | 86 | 74.8% | 0.0% | 0.0% | 0.0% | 25.2% | 0.017027 | 0.151060 | 0.055984 | DATA_UNAVAILABLE=21, LAND=65, NONE=255 |
| 2026-08-15T11:00:00Z | 255 | 0 | 0 | 0 | 86 | 74.8% | 0.0% | 0.0% | 0.0% | 25.2% | 0.015778 | 0.156399 | 0.055995 | DATA_UNAVAILABLE=21, LAND=65, NONE=255 |
| 2026-08-15T12:00:00Z | 255 | 0 | 0 | 0 | 86 | 74.8% | 0.0% | 0.0% | 0.0% | 25.2% | 0.014691 | 0.162555 | 0.056626 | DATA_UNAVAILABLE=21, LAND=65, NONE=255 |
| 2026-08-15T13:00:00Z | 255 | 0 | 0 | 0 | 86 | 74.8% | 0.0% | 0.0% | 0.0% | 25.2% | 0.015266 | 0.152805 | 0.054051 | DATA_UNAVAILABLE=21, LAND=65, NONE=255 |
| 2026-08-15T14:00:00Z | 255 | 0 | 0 | 0 | 86 | 74.8% | 0.0% | 0.0% | 0.0% | 25.2% | 0.015826 | 0.156804 | 0.053134 | DATA_UNAVAILABLE=21, LAND=65, NONE=255 |
| 2026-08-15T15:00:00Z | 255 | 0 | 0 | 0 | 86 | 74.8% | 0.0% | 0.0% | 0.0% | 25.2% | 0.015998 | 0.161013 | 0.053389 | DATA_UNAVAILABLE=21, LAND=65, NONE=255 |
| 2026-08-15T16:00:00Z | 255 | 0 | 0 | 0 | 86 | 74.8% | 0.0% | 0.0% | 0.0% | 25.2% | 0.017332 | 0.081007 | 0.050796 | DATA_UNAVAILABLE=21, LAND=65, NONE=255 |
| 2026-08-15T17:00:00Z | 255 | 0 | 0 | 0 | 86 | 74.8% | 0.0% | 0.0% | 0.0% | 25.2% | 0.019301 | 0.069664 | 0.049939 | DATA_UNAVAILABLE=21, LAND=65, NONE=255 |
| 2026-08-15T18:00:00Z | 255 | 0 | 0 | 0 | 86 | 74.8% | 0.0% | 0.0% | 0.0% | 25.2% | 0.020963 | 0.070130 | 0.049825 | DATA_UNAVAILABLE=21, LAND=65, NONE=255 |
| 2026-08-15T19:00:00Z | 255 | 0 | 0 | 0 | 86 | 74.8% | 0.0% | 0.0% | 0.0% | 25.2% | 0.021036 | 0.069348 | 0.048827 | DATA_UNAVAILABLE=21, LAND=65, NONE=255 |
| 2026-08-15T20:00:00Z | 255 | 0 | 0 | 0 | 86 | 74.8% | 0.0% | 0.0% | 0.0% | 25.2% | 0.021228 | 0.068515 | 0.048243 | DATA_UNAVAILABLE=21, LAND=65, NONE=255 |
| 2026-08-15T21:00:00Z | 255 | 0 | 0 | 0 | 86 | 74.8% | 0.0% | 0.0% | 0.0% | 25.2% | 0.021483 | 0.067706 | 0.048012 | DATA_UNAVAILABLE=21, LAND=65, NONE=255 |
| 2026-08-15T22:00:00Z | 255 | 0 | 0 | 0 | 86 | 74.8% | 0.0% | 0.0% | 0.0% | 25.2% | 0.022763 | 0.068084 | 0.047120 | DATA_UNAVAILABLE=21, LAND=65, NONE=255 |

## Root-cause conclusion

The distribution is consistent across all formal frames: all `NONE` cells are Level 1, while `LAND` and `DATA_UNAVAILABLE` cells are conservatively Level 5. The Viewer does not map a low score into Level 1 incorrectly; it consumes the published level and renders hard reasons in a separate layer.

Therefore the dominant cause of the visually quiet water area is the published B target-grid/model output and this demo artifact's low normalized scores, not a D color-threshold or coordinate-rendering defect. The 5-level scale is still semantically present, but this artifact does not contain navigable Level 2–4 cells.

The hard cells remain visible as `LAND` / `DATA_UNAVAILABLE`; they must not be softened or converted into safe risk colors. A future demo with more visually differentiated risk requires a new validated B artifact or an explicitly approved presentation projection, not an ad-hoc Viewer threshold change.

## Suggested short-term demo action

Keep the current exact-cell risk semantics, add the distribution summary/timeline to explain the result, and label the artifact as `demo_unvalidated`. Do not change the risk formula or fabricate intermediate levels in D.
