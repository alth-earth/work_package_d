---
Overall Status: ACTIVE
Content Status:
  - COMPLETED
  - IN_PROGRESS
Document Role: SUPPORTING
Scope: work package D change history
Branch: research-validation-system
Last Verified: 2026-08-23
---

# 工作包 D 变更记录

## Unreleased - Risk Explanation Consumer（2026-08-23 21:51 +08:00）

- feat: 增加可选 `risk-explanation.v1` strict consumer 与点击 risk cell explanation panel；
- compatibility: sidecar 缺失、unsupported、identity/grid/risk mismatch 只关闭 explanation，
  基础 RiskFrame、risk/hard layer、route 与 simulation 保持运行；
- boundary: Risk Level/Score/Confidence 只读 RiskFrame；contributors/reason/uncertainty 只读
  producer 字段，不排序、不补零、不生成业务结论；
- validation: missing/invalid/PARTIAL/COMPLETE tests PASS；D 全量 `91 passed / 3 skipped`；
  Firefox E2E 8 个静态资源 HTTP 200、console errors/warnings 0；COMPLETE/PARTIAL 使用明确
  标注的 synthetic B fixture，不冒充真实 producer artifact；
- performance: sidecar 缺失时 browser code raw 增量 27,876 bytes（合并 gzip 增量
  6,127 bytes），其中 validator 为 18,274 bytes；静态请求 7→8。100 万次 missing-path
  inspection 70.50 ms（约 0.070 µs/次）；无真实 sidecar，payload 增量 N/A。

## Unreleased - Winter Combined Research Viewer（2026-08-23 20:14 +08:00）

- feat: 对 combined presentation 的 scenario、RunContext、DatasetBundle、RiskWindow、
  candidate set 与 selected candidate 执行浏览器端 fail-closed identity 校验；
- feat: Research metadata panel 显示 Winter scenario label/ID、RunContext、DatasetBundle、
  RiskWindow 和 assembly identity；
- compatibility: legacy replay bundle 不要求 combined metadata，Summer single-route fallback
  与 causal replay tests 保持有效；
- validation: D 77 passed / 3 causal-replay-only skipped，Ruff/JS syntax PASS，Firefox
  Winter E2E console errors/warnings 0、required resources 全部 HTTP 200。

## Unreleased - Research Visualization Phase 1（2026-08-23 16:59 +08:00）

- feat: 在既有 Replay Viewer 中增加 `Research Validation` / `Operational Replay` /
  `Engineering Debug` 三态，不替换 frozen demo runtime；
- feat: 对 `presentation.route-candidates.v1` 执行 4×3 原子完整性、identity、geometry、
  canonical metrics、hard violation 与 scenario 一致性检查；不完整时 fail closed 回到
  `SINGLE_ROUTE_FALLBACK`；
- feat: 增加四层 selector、三目标 candidate comparison、地图 geometry overlay、实验
  metadata 与权威 `selected_candidate_id`/display-only highlight 区分；
- boundary: D 不 rank、不重算风险或 ETA、不改变 geometry、不推断缺失字段；
- validation: D 78 tests PASS、Ruff clean、两份 JS syntax PASS；现有 48h frozen bundle 的
  Firefox fallback regression PASS（console errors/warnings 0，required resources 200）。

## Unreleased - Winter Route Candidate Intake（2026-08-23 10:20 +08:00）

- feat: consume `presentation.route-candidates.v1` 的 `selected_candidate_id` 与 canonical
  `risk_metrics.average_risk/maximum_risk`；
- compatibility: 缺失或 `NOT_PUBLISHED` 时继续只显示 authoritative route；
- boundary: 本轮只闭合输入字段与文本消费，不实现 Winter Viewer 或 candidate map layer，
  不修改路线、ETA、风险或 replay 语义。

## Unreleased - Research Validation Navigation Aids（2026-08-22 00:17 +08:00）

- feat: add optional latitude/longitude graticules, coordinate labels,
  centre-latitude scale bar, and grid-north indicator to the replay Viewer;
- architecture: all aids reuse the canonical basemap projection and consume
  only published bundle metadata; no A/B/C data or semantics are introduced;
- test: add structural regressions for default layer state, projection reuse,
  render ordering, and absence of new data fetches.

## Unreleased - Competition Demo Freeze Validation（2026-08-21 17:15 +08:00）

- validation: add `DEMO_FREEZE_VALIDATION_REPORT.md` for source-package and
  independent-copy Firefox validation;
- feat: add Risk Forecast Summary from exported frame metadata and Route
  Decision explanation from published route/event metadata;
- feat: consume optional `route_candidates` without fabricating an objective
  comparison when the current artifact publishes no candidates;
- docs: add `ENVIRONMENT_LAYER_READINESS.md` and extend the rehearsal script;
- no A/B/C/contracts, risk formula, route semantics, ETA, ship motion, replay,
  or adoption semantics changed.

## Unreleased - Competition Demo Final Polish（2026-08-21 15:30 +08:00）

- audit: add `scripts/risk_distribution_audit.py` and
  `RISK_DISTRIBUTION_AUDIT.md`; the read-only audit confirms the current
  low-level water distribution is published B output, while hard cells remain
  separate and fail-closed;
- feat: render exported risk distribution summaries as a compact Risk Forecast
  Timeline without recalculating risk in the browser;
- fix: unavailable Current/+6h/+12h/+24h selections now state
  `Risk Forecast unavailable` and the formal available forecast window instead
  of leaving an unexplained blank layer;
- feat: add replay milestone presentation for departure, risk update, pending
  replan, and adoption; default demo opens paused at the replay departure time;
- test: final Firefox smoke covers risk/horizon, continuous ship movement,
  pending/adopted route state, layer/mode controls, zero console errors, and
  HTTP 200 static resources.

## Unreleased - Viewer Presentation Polish（2026-08-21 01:20 +08:00）

- feat: Presentation Mode uses softer exact-cell risk rendering with pixel
  aligned fills; Engineering Debug keeps the raw cell grid and diagnostics;
  `LAND` / `DATA_UNAVAILABLE` / `OTHER` remain separate and fail-closed;
- feat: route rendering adds display-only collinear densification and round
  joins, without changing authoritative route waypoints, ETA, adoption, or
  completed-track semantics;
- feat: replace the white vessel dot with a top-down ship icon rotated from the
  active authoritative route segment bearing; physical position remains the
  backend ETA + Simulation Clock contract;
- test: real Firefox smoke rechecked horizon, ship movement, layer controls,
  pending/adopted routes, Presentation/Engineering mode, and zero console
  errors/warnings; D suite remains 54 passed, ruff and JS syntax clean.

## Unreleased - Viewer Product Mainline（2026-08-20 21:13 +08:00）

- feat: add Current/+6h/+12h/+24h risk horizon controls backed by the
  Orchestrator horizon selection index; display requested/actual valid time,
  actual horizon, selection method, and fail-closed availability;
- feat: add independent Risk, Hard/Availability, Routes, and Completed Track
  presentation toggles; Presentation Mode now hides engineering diagnostics
  by default;
- test: add horizon exact/floor/unavailable artifact assertions; D suite now
  passes 54 tests;
- added Simulation-Clock-driven current Dynamic Risk overlay from the
  orchestrator presentation bundle (`bc.risk-frame.v2` frames);
- added separate hard/availability rendering for `LAND`,
  `DATA_UNAVAILABLE`, and other hard reasons; unknown is not safe;
- added superseded future-route rendering and explicit Presentation /
  Engineering Debug toggle;
- fixed timeline scrubbing to reconstruct compressed track/pending/superseded
  state from the timeline prefix, preserving append-only completed track;
- real Firefox browser E2E passed on `sb-viewer-baseline-12h-det`; D 53 tests,
  ruff, and JS syntax passed.

## Unreleased - 2026-08-20（Replay-driven Viewer adoption）

- feat: adopt replay-driven viewer application from orchestrator;
  D now owns HTML/JS/CSS (`viewer/index.html`, `app.js`, `style.css`),
  Simulation Clock, moving ship, route/track/pending rendering,
  static server (`scripts/replay_viewer_serve.py`),
  and proof renderer (`viewer/render_proof.py`);
- added `viewer/pngcodec.py`: pure-Python PNG codec (no numpy dependency);
  fixed bytearray slice bug in `read_png_rgb` (output was a copy, not a view);
- added `viewer/embed.py`: self-contained HTML builder (copied from orchestrator);
- added `viewer/README.md`: viewer-specific documentation;
- added `tests/unit/test_replay_viewer_bundle.py` (moved from orchestrator);
- added `tests/unit/test_pngcodec.py`: round-trip tests for filters 0/1/4 + RGBA;
- updated README to reflect D ownership of Replay-driven Viewer;
- D consumes only JSON/PNG artifacts from orchestrator export; never imports
  orchestrator private modules;
- D tests: 50 passed; ruff clean; render_proof produces valid PNG;


## Unreleased - 2026-08-18（Strategy B 关联）

- D 生产代码无改动；文档同步 Strategy B：orchestrator replay 引擎
  12h/24h/44h 真实回放 PASS、C 四层 PLANNING-HORIZON BLOCKER；
  见 `CAUSAL_REPLAY_MVP_20260818.md`。

## Unreleased - 2026-08-18 第二轮（Strategy B 关联）

- D 无代码改动；文档同步：三窗口解耦（77h）、v2 complete-route 12h
  集成 PASS、v3 four-layer contract-edge blocker。

## Unreleased - 2026-08-17（Causal Replay Feasibility / Mode Honesty）

- Frozen loader 从发布制品读取 `scenario_mode`（RunContext）、
  `simulation_start/end` 与 `knowledge_as_of`（run-report identity），
  demo-state 与 Viewer 显式展示 `RETROSPECTIVE BEST ESTIMATE` 及
  simulation/knowledge 时间；
- 新增测试断言（scenario_mode/knowledge_as_of/simulation 窗口）；D 共
  39 tests；
- 关联：A 侧 `causal_replay_feasibility_audit.py` 机器审计（PARTIAL），
  架构设计见根目录 `SIMULATION_REPLAY_ARCHITECTURE.md`。

## Unreleased - 2026-08-17（Temporal Semantics Audit）

- 新增 `src/arctic_route_display/demo/temporal_audit.py` 与
  `scripts/temporal_semantics_audit.py`：机器审计冻结制品时间语义
  （同一 risk window 的 as_of 一致性、route as_of/start_time、replan
  trigger ↔ suffix window、valid_time 逐小时轴），输出
  `temporal-semantics-audit.json`；
- 新增 2 项回归测试（145 帧单一 as_of、+6h replan 复用同一 knowledge
  切片）；D 共 38 tests；
- 文档/Viewer 口径修正：`Frame initial/replan` = risk valid_time，不是
  simulation snapshot；demo-state 暂不保存 as_of/scenario_mode（GAP 记录）；
  完整审计见根目录 `TEMPORAL_SEMANTICS_AUDIT_20260817.md` 与
  `TIME_MODEL_QUICK_REFERENCE.md`。

## Unreleased - 2026-08-17（Route Geospatial Integrity）

- 新增 `demo geo-integrity` 子命令与 `geo_integrity.py` 机器审计：
  waypoint 网格身份/8-neighbor 邻接、距离/ETA 可复算、waypoint hard
  （精确 ETA）、edge hard（C 同款 3 采样 + ≤10 km 密集采样）、对角角切
  （正交侧格）、ETA→frame 时间映射、Viewer 同一投影下像素空间相交；
- `demo preflight` 新增 Route Geospatial Integrity 硬门（FAIL 不输出
  READY FOR DEMO）；`demo build` 的 demo-state 每场景新增独立
  `geo_integrity` 摘要（PASS/FAIL/NOT_RUN），与 `result_origin` 分开展示；
- 修复 Viewer 双投影 bug：格子中心与路线共用同一 `project()`（等比投影），
  格子尺寸按真实经纬步长 × scale × 0.9；删除独立 `lonScale`/`latScale`；
  修复前路线在像素空间穿过 LAND/DU 格（A=252、B=72），修复后 = 0；
- Viewer 顶部新增 `ROUTE GEO INTEGRITY: PASS/FAIL/NOT RUN` badge，
  Coverage 面板新增对应行；
- 新增 11 项测试（含合成网格违规用例、真实冻结 48 路线审计、旧混合投影
  回归 oracle、单一投影断言、`node --check` JS 语法）；D 共 36 tests；
- 机器制品：`route-geospatial-integrity.json`；审计报告见根目录
  `ROUTE_GEOSPATIAL_INTEGRITY_AUDIT_20260817.md`。

## Unreleased - 2026-08-17（Demo Candidate 2）

- `demo build` 现在从冻结 risk store 读取每场景 2 帧真实风险帧
  （frame 0 / frame 6），输出 `spatial`（lon/lat、hard_reason、risk_score、
  risk_level、confidence）与 `phase_deltas`（12 组 Initial→Replanned 真实 Δ）；
- `demo serve` 新增本地 `/api/live/start` 与 `/api/live/status`：页面按钮可触发
  真实小窗重规划并轮询 elapsed/stage，完成后加载 `LIVE_COMPUTED` 结果；
- Viewer 重写：离线 SVG 经纬度地图（自动 fit bounds）、Availability / Risk
  score / Risk level 图层与图例、LAND / DATA_UNAVAILABLE / OTHER 独立着色、
  Scenario A/B 切换、Compare initial→replanned（双路线 + Δ 表）、Live 按钮
  与 indeterminate 进度、失败状态透明显示；
- 新增 `spatial.py`、`errors.py`、`DemoFrameView/DemoSpatial/DemoRouteDelta`、
  `compute_phase_deltas()`；DemoRoute 增加 `expanded_nodes`；
- 新增 spatial/viewer-offline 测试；D 共 25 tests 通过；
  RC1 golden regression PASS、Scenario B regression PASS、离线审计 NONE。

## Unreleased - 2026-08-17（RC2 development）

- Demo Engineering：新增 `demo` 子命令（preflight/build/run-live/serve）、
  `arctic_route_display.demo`（frozen loader + live loader + preflight）、
  `web/demo_viewer.html` 本地只读 viewer（无外部依赖）；
  结果标识 `result_origin = FROZEN_VALIDATED / LIVE_COMPUTED`；
  D 17 tests 通过。
- 新增 `load_coverage_preflight` 与 `CoveragePreflightView`：离线消费
  orchestrator 的 `planning-coverage-preflight.json`（可带本地 schema 校验），
  暴露 gate/land/data_unavailable/total 等解释性指标；
- CLI 新增 `coverage <path>` 子命令，`snapshot` 可选 `--coverage` 附带摘要；
- coverage 摘要补充 `other_hard_nodes` / `hard_nodes` / `planning_available_nodes`；
- coverage 摘要补充 `ice_free_neutralized_nodes`（无冰中性化 provenance 摘要）；
- 新增 fixture 与 3 项测试；D 共 12 tests 通过。

## Unreleased - 2026-08-16（RC1）

- `loader._validate` 改为本地 referencing Registry：`arctic-route.local` schema
  引用从本地 `work_package_c/schemas` 解析，不再依赖网络；
- `load_v3_group` 支持真实 v3 制品的 `layers` 数组形式（含 `planning_layer`），
  同时保留 dict 形式兼容；
- 新增真实制品回归 fixtures（initial/replanned）与 3 项测试（含 socket 阻断离线
  校验、initial/replanned 区分）；D 共 9 tests 通过。
