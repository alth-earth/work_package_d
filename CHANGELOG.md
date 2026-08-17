# 工作包 D 变更记录

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
