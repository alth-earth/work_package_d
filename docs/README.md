---
Overall Status: ACTIVE
Content Status:
  - COMPLETED
  - PLANNED
Document Role: CANONICAL
Applicability: CURRENT
Scope: work package D README
Canonical For: D ownership and viewer application
Branch: research-validation-system
Last Verified: 2026-09-02 02:40 +08:00
Related Canonical Docs: ../arctic_route_governance/current/architecture/ARCTIC_ROUTE_SYSTEM.md
---

> **路径约定（2026-08-24）**：本文件中 `${ARCTIC_ROUTE_ROOT}` 为工作区根占位符，
> 指向包含各工作包目录（`arctic_route_contracts/`、`work_package_a/` 等）的公共根。
> 解析优先级：环境变量 > 当前所在目录 > `$HOME`。完整定义见
> `arctic_route_governance/README.md` 的"路径约定"章节。

# Work Package D: Display / Visualization / Presentation

面向演示人员的使用说明：[USER_GUIDE.zh-CN.md](USER_GUIDE.zh-CN.md)

## 双航线正式 Viewer 包（2026-09-02 01:35 +08:00）

两条演示航线现已拥有等齐的正式 viewer 包（`research-validation-system` 基线）：

| 航线 | 正式 viewer 包 | scenario | corridor |
|---|---|---|---|
| A：Murmansk → Dikson | `output/formal-motion-murmansk-viewer-package-v1/` | `murmansk_dikson_august_2026_demo_v1` | `offshore_murmansk_to_offshore_dikson` v2.2.0 |
| B：Tromsø → Isfjorden | `viewer/`（Winter）与 `output/formal-motion-original-dynamic-viewer-package-v1/` | `tromso_isfjorden_february_2026_research_v1` | `tromso_to_isfjorden_outer` v1.2.0 |

A 航线包是从 rc1/rc2 冻结执行制品（A 数据层可信）**重导出**的正式制品，未重跑 B/C 的
A\* 规划：C `arctic-route-motion` 仅从冻结 plan-set v3 + risk-store（145 帧）生成
`cd.route-motion-set.v1`（initial），Orchestrator `replay_viewer_export.py` 导出完整
viewer 包（bundle/plan-set/motion transport/basemap/preflight/checksums/manifest）。

- identity：bundle `a-bundle-32cafad4ee280f286d8eb049`、run `run-...0b0005`、
  layer-set `layer-set-sha256-3f9a8f7b...`、candidate-set `route-candidates-sha256-347b41bc...`、
  assembly `winter-viewer-sha256-5602d5e8a3451cbdd1901c0de9ebede3558cd221ec4eb2612f415c3f68b05703`
- formal motion：`route-motion-set-sha256-1234ec4e1b085ced77b89592a7b5f5875e3ac0894c3ecdecafba0d6aa489c56b`
  （覆盖四层，`formal_motion_policy.provided=true`）
- 145 风险帧、12 候选、route-integrity 12/12 PASS、`replay-viewer-preflight` 全 PASS
- `replanning_status = UNAVAILABLE_IDENTITY_BOUND_CAUSAL_REPLAY_REQUIRED`：A 航线冻结执行
  制品不含 causal replay manifest；B 默认包已另行接入真实 retrospective replay。A 时间线为
  C route ETA 的 presentation projection，不伪造 replan event

派生 sidecar（不触碰 A/B/C 源文件，输出不可变目录）：
- `work_package_a/data/output/rc2-smoke/presentation-mur-opt/`（frame-index / route-candidates / route-integrity）
- `work_package_a/data/output/rc2-smoke/motion-mur-opt/initial|replanned/`（C motion 产物，checksums 绑定）
- 派生脚本：`arctic_route_orchestrator/scripts/derive_murmansk_sidecars.py`

A 航线 replanned motion（`motion-mur-opt/replanned/`）已生成但未并入主 viewer 包——当前
导出流程 `plan_sets_by_revision` 仅绑定单一 plan-set 层（无 causal replay manifest 时无法
合并多 revision）；如需双 revision 展示需先补齐 A 航线 causal replay 制品。

## 当前 Winter 动态 Viewer（2026-09-02 02:40 +08:00）

默认 `viewer/` 已恢复原始冻结身份并切换到真实 `retrospective_dynamic_replay` 到达态组合
制品：145 个风险帧、8,641 个仿真时刻、25 个 snapshot、9 个 revision，每个 revision
四层×三目标共 12 条候选。119 个事件包含 8 组
`REPLAN_DECIDED/REPLAN_ADOPTED/ROUTE_CHANGED`；最终 revision 为 R9、航行状态
`ARRIVED`、无 pending。这是真实数据的事后动态投影，保留 `issue_time`，不冒充 causal
replay；Summer frozen fallback 仍保留。assembly 为
`winter-viewer-sha256-a375b431ed7c431487300988a7dc6c298cbecaf3a8e77ec4bc1371cf6be894e7`。

风险时域在 344px 与 528px 侧栏都保持 145 ticks、横向滚动、最小柱宽，绿色均值与黄色最大
值来自真实 risk summary。当前原始冻结身份没有可诚实绑定的 B sidecar：精确 A source
record 已在历史 detided-retirement 中退役，不能从最终 RiskFrame 重建 component trace；
Viewer 因而显示 `Explanation unavailable`，但不改变 RiskFrame、路线或仿真。路线优先消费
C 正式 `motion_samples`：R1–R4 为通过全部门禁的 `CURVE`；R5–R7 因
`integrated_risk_increased`、R8–R9 因几何条件回退 raw。正式 waypoint、ETA、风险、adoption
与 motion gate 不变。
JavaScript 对 adoption offset 的比较仅容忍其 `Date` 必然丢失的亚毫秒精度，2 ms 偏差仍
失败关闭。

## Risk Explanation optional consumer（2026-08-23 21:51 +08:00）

> 本节保留消费者首次验收快照；当前默认原始冻结身份没有 sidecar，现行状态以上方章节为准。

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

当前验证：D unit `107 passed`；浏览器对 missing/invalid fallback 与 synthetic B fixture 的
PARTIAL/COMPLETE consumer 行为保持覆盖；当前默认包按真实缺失显示 unavailable。静态资源
HTTP 200，console errors 为 0。其他身份曾发布过 content-addressed sidecar/manifest，不能
因此跨身份复用；sidecar 的存在也不能声称科学标定或真实导航资格。

## Winter Combined Research Viewer（2026-08-23 20:14 +08:00）

D 已通过同一 Winter experiment identity 的 combined package 完成 Firefox E2E。Viewer
显示真实 Winter 145 个 hourly RiskFrame、独立 LAND/`DATA_UNAVAILABLE` hard layer、
四层 × 三目标共 12 条 C route candidates，以及 full-voyage recommended waypoint ETA
驱动的 53.4 h navigation simulation。页面显式显示 scenario、RunContext、DatasetBundle、
RiskWindow 与 assembly identity。

combined identity 在浏览器内继续 fail closed：scenario/run/bundle/risk-window/candidate set
或 canonical selected route 不一致时不启用 Research View。没有同身份 causal replay 时，该
时间线是 C route ETA 的 presentation projection，`source_replay=null`，并显示
`UNAVAILABLE_IDENTITY_BOUND_CAUSAL_REPLAY_REQUIRED`；不包含伪造 replan event。只有
Orchestrator 传入真实身份绑定回放后，才展示多 revision 的 pending/superseded 与
`REPLAN_DECIDED/ADOPTED`。D 不重算风险、ETA、route geometry 或 route ranking。既有 Summer
single-route fallback 保持可用。

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

## Viewer Product Mainline（2026-09-01）

The current D mainline is the browser-verified C-published
`cd.route-motion-set.v1` artifact in the default Winter bundle:

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
  Routes, original route polyline, and Completed Track. The original route
  polyline is off by default; the blue formal producer motion route is the
  primary route layer. Presentation Mode starts with engineering text hidden;
  Debug Mode exposes the full timing and adoption diagnostics.
- The formal motion samples are the single geometry source for the route,
  vessel position, heading, speed, trail, and completed track. D does not run
  a local display smoother. Missing, stale, tampered, or identity-inconsistent
  formal motion falls back to the authoritative raw waypoint/timeline and
  displays the concrete reason.
- “当前路段”是独立的 operational overlay，不受原始折线图层开关影响；有正式
  `motion_samples` 时按当前 segment 的 ETA 窗口截取曲线，否则回退当前 raw segment。
- 曲线控件提供当前窗口局部放大、最小曲率半径和相对权威航点的最大真实偏离；这些是
  presentation diagnostics，不改变正式 motion、安全门禁或平滑幅度。
- Risk Forecast Timeline 保留完整小时帧；窄侧栏使用横向滚动、最小 tick/bar 宽度，不再
  让 flex 布局把绿色/黄色柱压成 0px。`make browser-regression` 已覆盖 344px 与 528px。

Browser evidence is kept outside Git under
`${ARCTIC_ROUTE_ROOT}/.runtime/viewer-proof/`. Verified environment: Firefox on
`127.0.0.1:8131`, final required resources all HTTP 200, zero console errors or
warnings. Horizon checks include 10:30 +6h = 16:00 / actual +5h30m and 10:30
+12h/+24h = unavailable. D full tests: 114 passed, 3 replay-only skips; ruff and JS syntax are
clean. Browser layout regression passes at 344px and 528px.

## Viewer Presentation Polish（历史兼容，2026-08-21 01:20 +08:00）

- Presentation Mode uses softer exact-cell risk rendering and pixel-aligned
  fills; Engineering Debug retains the raw cell grid and diagnostics.
- Historical route drawing applied display-side constrained local cubic B-spline
  geometry with linear densification as its fail-closed fallback. Those scripts
  remain for compatibility tests but are not loaded by the default Viewer.
- The white vessel dot is now a small top-down ship icon. Its position remains
  backend ETA + Simulation Clock; its rotation is derived from the active
  authoritative route segment bearing. Pixel speed remains absent.
- The Orchestrator bundle declares `presentation.viewer-presentation.v1`:
  exact risk cells/no interpolation, separate fail-closed hard reasons,
  formal producer motion samples with raw waypoint/timeline fallback, and
  ETA-based vessel rendering.
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

## Formal engineering route motion（2026-08-31）

- Viewer 新增 `cd.route-motion-set.v1` strict reader；有效 artifact 默认驱动路线、船位、
  producer course/speed、trail 和 completed-track，缺失或非法时整体回退 raw timeline；
- D 仅验证和插值 C 发布的 motion samples，不在生产模式重算曲线、ETA、风险或运动学；
- research sidecar 继续默认关闭且只在研究视图显式启用，不是生产 fallback；
- synthetic bulk-carrier profile 与声明 raster-model corridor 只构成工程仿真资格，不表示
  实船、导航或 UKC 认证。完整边界见 [Viewer 技术说明](viewer/README.md)。

## Route display smoothing（2026-08-31，历史实现与当前边界）

- 历史版本曾在 Viewer 侧启用 display-only 局部三次 B 样条；当前默认 Viewer 已切换为
  C 发布的 `cd.route-motion-set.v1` `motion_samples`，D 不再本地重算或放大平滑幅度；
- 原始 `routes.waypoints`、候选 geometry、ETA、route metrics、active/pending/adopted
  语义和 C→D 合同均不改；曲线只存在于 Canvas paint coordinates 和 Viewer 本地仿真呈现状态；
- Viewer 仿真中的船位、船头方向、近期轨迹和 completed-track 跟随正式 motion samples；
  原始 waypoint ETA 仍是时间锚点，formal motion 失效时回退 timeline。原始 route waypoint、
  active revision、route metrics、ETA、adoption 事件和 C→D 合同仍保持权威，不被回写；
  因此该功能不是船舶操纵性、安全走廊或生产资格证明；
- 图例和图层控件明确区分蓝色正式曲线与白色原始折线；原始折线默认隐藏，可按需打开做
  几何对照；
- Orchestrator 的 `presentation.viewer-presentation.v1` 明确声明该展示策略及原始折线回退。
- C 另提供 `c.research-route-smoothing-sidecar.v1` 的 geometry-only 研究输出；只有在
  Orchestrator 显式传入 sidecar 且操作员打开研究运动开关后，D 才读取它的曲线样本。该
  研究路径校验 route/waypoint/ETA identity，失败时回退 timeline，默认不启用，不改变正式
  route、风险、ETA、重规划或生产发布语义。

### 可见曲线修正（2026-08-31 00:19 +08:00）

- 旧的 `2,000 m` 展示尺度在当前约 `40 km` 网格边上只有近似亚像素的拐角偏离，
  因此 Replay Viewer 的 display-only 参数调整为 `40,000 m` nominal display scale、
  `20,000 m` 最大显示偏离和 `0.48` 最大切角比例；这些数值只控制画面，不是船舶操纵
  半径、航行安全限值或生产资格参数。
- `web/demo_viewer.html` 旧版独立入口也改为局部 cubic `path` 绘制，并保留无效/短边/
  相邻转角回退思路；其真实 waypoints、ETA、指标和路线 authority 不变。
- 本次验证包含静态/Node/聚焦单元行为和离线 VM 运动检查；未进行浏览器截图、真实 replay
  或船舶可执行性验证。

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
- Viewer does not invent speed, ETA, risk or route authority. Planned route
  lines use producer-published formal motion samples when identity-validated;
  otherwise they use the authoritative raw waypoint/timeline.

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
  Integrity 独立 badge）；路线使用 display-only 局部 cubic path，原始 waypoints 仍是
  authority；
- `src/arctic_route_display/demo/spatial.py`：冻结风险帧 → 紧凑空间展示模型；
- `src/arctic_route_display/demo/errors.py`：demo 层共享验证异常；
- `configs/demo_frozen_sources.json`：frozen A/B 与 live smoke 来源配置；
- `tests/`：状态机与分组测试。

## 相关文档

- [C→D 合同](../../work_package_c/docs/CD_CONTRACT.md)
- [D 展示层选型评估](../../arctic_route_governance/reports/decisions/D_SELECTION_EVALUATION_v2_vs_v3.md)
- [顶层系统权威](../../arctic_route_governance/current/architecture/ARCTIC_ROUTE_SYSTEM.md)
