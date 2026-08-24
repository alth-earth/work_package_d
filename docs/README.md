---
Overall Status: ACTIVE
Content Status:
  - COMPLETED
  - PLANNED
Document Role: CANONICAL
Scope: work package D README
Canonical For: D ownership and viewer application
Branch: research-validation-system
Last Verified: 2026-08-23
Related Canonical Docs: ../arctic_route_governance/current/architecture/ARCTIC_ROUTE_SYSTEM.md
---

> **路径约定（2026-08-24）**：本文件中 `${ARCTIC_ROUTE_ROOT}` 为工作区根占位符，
> 指向包含各工作包目录（`arctic_route_contracts/`、`work_package_a/` 等）的公共根。
> 解析优先级：环境变量 > 当前所在目录 > `$HOME`。完整定义见
> `arctic_route_governance/README.md` 的"路径约定"章节。

# Work Package D: Display / Visualization / Presentation

## Risk Explanation optional consumer（2026-08-23 21:51 +08:00）

D 已实现可选 `risk-explanation.v1` consumer。Winter Viewer 点击 risk cell 后，Risk Level、
Risk Score 与 Confidence 始终读取当前显示的 `bc.risk-frame.v2`；只有 sidecar 通过
`schema_version`、RiskWindow、RiskFrame 和 grid/坐标 identity 对照后，才按 producer
发布顺序显示 contributors、contribution、reason 与 uncertainty。D 不排序贡献、不补零、
不生成 reason，也不修改 RiskFrame、地图图层、路线或仿真状态。

sidecar 可由 presentation package 的可选 `risk_explanation` 字段传入；自包含模式可使用
`window.RISK_EXPLANATION_SIDECAR`。字段缺失不触发额外请求，面板显示
`Explanation Status: UNAVAILABLE · Explanation unavailable`，原 Viewer 行为保持不变。
无效或 identity mismatch 的 sidecar 仅在 explanation gate 内失败关闭，基础 RiskFrame
继续显示。

验证：D `91 passed / 3 causal-replay-only skipped`；Firefox 对真实 Winter bundle 的 missing /
invalid fallback 以及 synthetic B fixture 的 PARTIAL / COMPLETE rendering E2E 通过，8 个静态
资源 HTTP 200，console errors/warnings 为 0。真实 B producer artifact 和 Orchestrator
immutable transport 尚未实现，因此当前不能声称真实风险贡献解释已发布。

## Winter Combined Research Viewer（2026-08-23 20:14 +08:00）

D 已通过同一 Winter experiment identity 的 combined package 完成 Firefox E2E。Viewer
显示真实 Winter 145 个 hourly RiskFrame、独立 LAND/`DATA_UNAVAILABLE` hard layer、
四层 × 三目标共 12 条 C route candidates，以及 full-voyage recommended waypoint ETA
驱动的 53.4 h navigation simulation。页面显式显示 scenario、RunContext、DatasetBundle、
RiskWindow 与 assembly identity。

combined identity 在浏览器内继续 fail closed：scenario/run/bundle/risk-window/candidate set
或 canonical selected route 不一致时不启用 Research View。该时间线是 C route ETA 的
presentation projection，`source_replay=null`，不是新生成的 causal replay；D 不重算风险、
ETA、route geometry 或 route ranking。既有 Summer single-route fallback 保持可用。

## Research Validation role（2026-08-21 23:18）

D is the Visualization and Validation Platform and remains the sole Viewer runtime owner.
The 48h artifact Viewer is the inherited browser-validated baseline. Research work must expose
published provenance, uncertainty and comparisons; it must not synthesize candidate routes,
environment contributors or backend semantics.

D owns the Replay-driven Viewer application: HTML/JS/CSS, Simulation Clock,
moving ship rendering, route/track/pending rendering, static server, and proof
renderer. D consumes only JSON/PNG artifacts produced by the orchestrator's
`scripts/replay_viewer_export.py` — it never imports orchestrator private
Python modules.

## Winter route candidate intake（2026-08-23 10:20 +08:00）

D 已可读取 Orchestrator 发布的 `presentation.route-candidates.v1`：候选列表使用
`candidate_id/layer/objective`、C 原始 ETA/距离和 `risk_metrics`，并按
`selected_candidate_id` 标记 full-voyage recommended。缺失 sidecar 或
`status=NOT_PUBLISHED` 时仍保持单 authoritative route。

该接口现已进入 Winter combined package 并通过完整浏览器验收；地图候选 geometry 与
Research Presentation Mode 的实现见下一节。

## Research Presentation Mode Phase 1（2026-08-23 16:59 +08:00）

D 在既有 Replay Viewer 上新增三态视图：`Research Validation`、
`Operational Replay`、`Engineering Debug`。只有经过 D fail-closed 检查的
`presentation.route-candidates.v1` 原子发布才启用 Research View：必须恰好覆盖
四层 × 三目标、12 个唯一 `candidate_id`、合法 `LineString` geometry、完整 canonical
metrics、`hard_violation_count=0`，且 candidate scenario 与 Viewer bundle 一致。

Research View 按 source publication order 展示指定 layer 的 `fastest`、`low_risk`、
`recommended`，地图只绘制 sidecar 提供的 geometry；距离、travel hours、arrival ETA、
average/maximum/integrated risk 均直接显示 artifact 数值。用户选择只改变高亮，
不改 C 的 `selected_candidate_id`、排序、route geometry、ETA 或风险指标。

当前 frozen 48h Summer Viewer 的 sidecar 仍为 `NOT_PUBLISHED`，继续明确显示
`SINGLE_ROUTE_FALLBACK`。独立 Winter combined package 已把真实 RiskWindow、12-route
sidecar 与 ETA simulation 绑定，并通过 Firefox `REAL_E2E_PASS`；它不覆盖 Summer frozen
artifact，也不将 ETA projection 写成 replay evidence。

## Professional navigation aids（2026-08-22 00:17）

The research-validation Viewer adds a bundle-only navigation aid layer:

- latitude/longitude graticules and edge labels use the same canonical
  `project(lon, lat)` transform as risk cells, routes, track, and vessel;
- a centre-latitude scale bar reports an EPSG:4326 display-distance estimate;
- the north indicator denotes grid north for the north-up map, not magnetic
  bearing;
- the layer is enabled by default and can be disabled independently without
  changing the bundle or any A/B/C semantics.

These aids are `IMPLEMENTED` and unit/syntax validated. They consume only
published basemap projection/bounds metadata and do not fetch environmental
data or calculate navigation decisions.

## Replay-driven Viewer (2026-08-20)

The viewer lives in `viewer/`:
- `index.html` / `style.css` / `app.js` — browser application
- `embed.py` — self-contained HTML builder
- `pngcodec.py` — pure-Python PNG codec (no numpy dependency)
- `render_proof.py` — offline proof image renderer
- `docs/viewer/README.md` — viewer-specific documentation

The static server lives in `scripts/replay_viewer_serve.py`.

## Viewer Product Mainline（2026-08-20 21:13 +08:00）

The current D mainline is browser-verified on the real
`sb-viewer-baseline-12h-det` artifact:

- `bundle.json` carries presentation-ready `bc.risk-frame.v2` spatial frames;
  D only selects and renders them;
- Orchestrator also emits precomputed Current / +6h / +12h / +24h selections
  per Simulation Time, including requested/actual valid time, actual horizon,
  selection method, availability, and fail-closed reason;
- one Simulation Clock drives vessel, risk frame, route state, completed
  track, and events; hourly risk cadence is independent from continuous ship
  rendering;
- `LAND`, `DATA_UNAVAILABLE`, and other hard reasons are a separate overlay;
  unknown is never rendered as safe;
- active, pending, and superseded future routes remain distinct;
  `REPLAN_DECIDED` leaves the active route unchanged until `REPLAN_ADOPTED`;
- Presentation Mode and Engineering Debug Mode are separated by the toggle.
- Presentation layers can be toggled independently: Risk, Hard/Availability,
  Routes, and Completed Track. Presentation Mode starts with engineering text
  hidden; Debug Mode exposes the full timing and adoption diagnostics.

Browser evidence is kept outside Git under
`${ARCTIC_ROUTE_ROOT}/.runtime/viewer-proof/`. Verified environment: Firefox on
`127.0.0.1:8131`, final required resources all HTTP 200, zero console errors or
warnings. Horizon checks include 10:30 +6h = 16:00 / actual +5h30m and 10:30
+12h/+24h = unavailable. D full tests: 57 passed; ruff and JS syntax are clean.

## Viewer Presentation Polish（2026-08-21 01:20 +08:00）

- Presentation Mode uses softer exact-cell risk rendering and pixel-aligned
  fills; Engineering Debug retains the raw cell grid and diagnostics.
- Route drawing applies only display-side linear densification and round joins;
  authoritative waypoints, ETA, adoption, and completed-track semantics do not
  change.
- The white vessel dot is now a small top-down ship icon. Its position remains
  backend ETA + Simulation Clock; its rotation is derived from the active
  authoritative route segment bearing. Pixel speed remains absent.
- The Orchestrator bundle declares `presentation.viewer-presentation.v1`:
  exact risk cells/no interpolation, separate fail-closed hard reasons,
  display-only route densification, and ETA-based vessel rendering.
- A real Firefox smoke after the polish rechecked horizon availability,
  continuous movement, pending/adopted routes, layer toggles, and both modes;
  console errors/warnings were zero.

## Competition Demo Final Polish（2026-08-21 15:30 +08:00）

- `scripts/risk_distribution_audit.py` produces the read-only
  `RISK_DISTRIBUTION_AUDIT.md` from the exported bundle. It confirms whether a
  quiet risk map comes from published B values or a Viewer rendering defect;
- the Orchestrator presentation bundle carries descriptive per-frame risk
  summaries and grid metadata. The Viewer renders a compact Risk Forecast
  Timeline from those summaries and never recalculates risk;
- unavailable horizons explicitly show `Risk Forecast unavailable` plus the
  available formal forecast window; no stale frame is reused;
- Presentation Mode opens paused at the replay departure, and the presentation
  panel shows replay milestones for departure, risk update, pending replan, and
  adoption. Engineering Debug and the original layer controls remain available;
- final Firefox verification: page/map/route/ship/risk/hard layers visible,
  continuous motion, horizon and replan states correct, 0 console errors and
  warnings, required local resources HTTP 200.

## Competition Demo Freeze Validation（2026-08-21 17:15 +08:00）

- `DEMO_FREEZE_VALIDATION_REPORT.md` records fresh Firefox validation from the
  existing formal artifact and an independent copied `viewer/` directory;
  both load in Presentation Mode, paused at departure, with HTTP 200 required
  resources and zero console errors/warnings;
- Presentation Mode now includes a Risk Forecast Summary sourced from exported
  frame summaries: mean/max score, forecast trend, LAND count,
  DATA_UNAVAILABLE count, and total hard-cell count;
- Route Decision shows active revision, published distance and arrival ETA,
  available route metrics, and the real `REPLAN_DECIDED` / `REPLAN_ADOPTED`
  event trace. Missing average/max risk metrics remain `not published`;
- `route_candidates` is a backward-compatible presentation extension. The
  current artifact publishes an empty candidate set, so the Viewer keeps the
  single authoritative route and states that comparison is unavailable;
- `ENVIRONMENT_LAYER_READINESS.md` records that Sea Ice/Wind/Wave/Current/
  Temperature arrays and contributor fields are not in the current artifact;
  no synthetic environmental layer is shown;
- D tests: 58 passed; Ruff and JS syntax are clean.

### How to build artifacts (orchestrator side)

```bash
cd ${ARCTIC_ROUTE_ROOT}/arctic_route_orchestrator
./.venv/bin/python scripts/replay_viewer_export.py   /path/to/causal-replay-manifest.json   --data-root ${ARCTIC_ROUTE_ROOT}/work_package_a/data   --route-id tromso_to_isfjorden_outer   --output-dir ${ARCTIC_ROUTE_ROOT}/work_package_d/viewer
```

### How to run the viewer

```bash
cd ${ARCTIC_ROUTE_ROOT}/work_package_d
./.venv/bin/python scripts/replay_viewer_serve.py --root viewer --port 8123
```

### Business principles

- Ship position = route waypoint ETA + simulation_time (NOT pixels/s)
- Simulation Clock drives all layers (ship, route, risk)
- REPLAN_DECIDED != REPLAN_ADOPTED (pending route shown separately)
- Completed track is append-only
- Replan only changes future route
- Viewer does not invent speed or bend route geometry; display densification is
  collinear and presentation-only.

## Display Layer（snapshot / coverage / demo）

The following describes the older D display layer that consumed C published
route plan artifacts directly. It is still functional but the Replay-driven
Viewer above is the current active development path.

接口区分：Legacy Display 直接消费顶层 `cd.four-layer-route-plan-set.v3`（其中单路线为
`cd.route-plan.v3`）或 `cd.route-plan.v2`；当前 Replay Viewer 不直接消费该集合，而只消费
Orchestrator 发布的 `replay.viewer-bundle.v1`。frozen 48h bundle 的 candidate package 仍为
`NOT_PUBLISHED`；Winter Research sidecar 已 `PUBLISHED` 12 条真实路线。D 在两种状态下都不从
route revisions 推断候选路线。

> 历史阶段进展（RC1 真实制品消费 / RC2 coverage preflight / Demo Candidate 1-2 /
> Geospatial Integrity / Temporal Semantics Audit / Causal Replay Feasibility &
> MVP）见 `archive/` 下的对应报告。
> 主线口径：v3 四层 × 三目标（12 路线整组）+ 重规划为演示主线，v2 三目标为强制后备
> （2026-08-15 确认）。

D 只消费 C 已发布的原子制品，不调用 A/B/C 内部函数、不持有计算锁、不反向修改计算事实。

## 边界

- 输入：`cd.four-layer-route-plan-set.v3`（整组）或 `cd.route-plan.v2`（后备）的 JSON 文件；
- 输出：供展示层使用的“渲染摘要/状态”JSON；
- 不允许：读取 A/B 私有数据库、等待规划计算、消费不完整整组、跨代次拼接。

## 快速使用

```bash
cd ${ARCTIC_ROUTE_ROOT}/work_package_d
make sync
make check
arctic-route-display snapshot --v3 /path/to/routes/v3/initial.json --output out/snapshot.json
arctic-route-display coverage /path/to/planning-coverage-preflight.json
arctic-route-display demo preflight
arctic-route-display demo geo-integrity
arctic-route-display demo build --config configs/demo_frozen_sources.json --output demo-state.json
arctic-route-display demo run-live --config configs/demo_frozen_sources.json --output live-result.json
arctic-route-display demo serve --state demo-state.json --port 8123
```

`demo serve` 除静态 viewer 外还提供本地 API：

- `POST /api/live/start`：后台启动真实小窗重规划（worker/watchdog）；
- `GET /api/live/status`：返回 RUNNING/elapsed/stage 或 DONE（含 LIVE_COMPUTED 场景）
  或 FAIL/TIMEOUT。

viewer 空间图层数据由 `demo build` 从冻结 risk store 读取：

```text
frozen output risk/full-window-commit.json
        ↓ risk_id
risk-store-*/frames/*.json（真实 lon/lat + hard_reason + risk）
        ↓
demo-state.json spatial
        ↓
Viewer SVG（Availability / Risk score / Risk level）
```

Route Geospatial Integrity gate（`demo geo-integrity`）独立于 Coverage Gate：
逐路线验证 waypoint 网格身份/邻接、距离/ETA 可复算、waypoint/edge hard
（按 ETA 采样）、对角角切、时间帧映射，以及 Viewer 同一投影下的像素空间
相交数；机器制品默认写到
`work_package_a/data/output/rc2-smoke/route-geospatial-integrity.json`。

Temporal semantics audit（`scripts/temporal_semantics_audit.py`）只读冻结
制品，校验：同一 risk window 内所有帧共享 `as_of_time`、route `as_of_time`
与 knowledge cutoff 一致、initial/replanned `start_time` 语义、
replan trigger 与 suffix window 一致、valid_time 逐小时轴；输出
`work_package_a/data/output/rc2-smoke/temporal-semantics-audit.json`。

Frozen loader 同时从发布制品读取 `scenario_mode`（RunContext）与
`knowledge_as_of`（run-report identity），demo-state/Viewer 显式展示
`RETROSPECTIVE BEST ESTIMATE` 与 simulation 窗口，避免把事后数据当作当时
预测。

## 真实制品事实

- 离线 schema：`work_package_c/schemas/four-layer-route-plan-set-v3.schema.json`
  （`arctic-route.local` 引用本地解析，不需要网络）；
- 真实制品 fixtures：`tests/fixtures/v3_initial.json` / `v3_replanned.json`；
- 测试：12 tests（含断网回归、initial/replanned 可区分、coverage preflight）。

## 结构

- `src/arctic_route_display/models.py`：`RouteSetView`、`LayerView`、`DisplayState`；
- `src/arctic_route_display/loader.py`：读取/分组 v3 整组与 v2 后备，可选用 C Schema 校验；
- `src/arctic_route_display/cli.py`：`snapshot` 与 `coverage` 命令；
- `src/arctic_route_display/demo/`：Demo Data Model、Frozen/Live loader、preflight；
- `src/arctic_route_display/demo/geo_integrity.py`：Route Geospatial Integrity
  审计（waypoint/edge/corner/temporal/viewer-projection）；
- `src/arctic_route_display/demo/temporal_audit.py` +
  `scripts/temporal_semantics_audit.py`：Temporal Semantics 机器审计；
- `web/demo_viewer.html`：本地只读 viewer（localhost，无 CDN，离线；真实经纬度
  地图、风险/数据质量图层、Compare 模式、Live 按钮与进度反馈、Route Geospatial
  Integrity 独立 badge）；
- `src/arctic_route_display/demo/spatial.py`：冻结风险帧 → 紧凑空间展示模型；
- `src/arctic_route_display/demo/errors.py`：demo 层共享验证异常；
- `configs/demo_frozen_sources.json`：frozen A/B 与 live smoke 来源配置；
- `tests/`：状态机与分组测试。

## 相关文档

- [C→D 合同](../work_package_c/docs/CD_CONTRACT.md)
- [D 展示层选型评估](../arctic_route_governance/reports/decisions/D_SELECTION_EVALUATION_v2_vs_v3.md)
- [顶层系统权威](../arctic_route_governance/current/architecture/ARCTIC_ROUTE_SYSTEM.md)
