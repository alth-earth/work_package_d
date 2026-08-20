# 工作包 D 变更记录

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
