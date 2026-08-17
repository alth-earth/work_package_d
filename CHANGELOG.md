# 工作包 D 变更记录

## Unreleased - 2026-08-17（RC2 development）

- 新增 `load_coverage_preflight` 与 `CoveragePreflightView`：离线消费
  orchestrator 的 `planning-coverage-preflight.json`（可带本地 schema 校验），
  暴露 gate/land/data_unavailable/total 等解释性指标；
- CLI 新增 `coverage <path>` 子命令，`snapshot` 可选 `--coverage` 附带摘要；
- 新增 fixture 与 3 项测试；D 共 12 tests 通过。

## Unreleased - 2026-08-16（RC1）

- `loader._validate` 改为本地 referencing Registry：`arctic-route.local` schema
  引用从本地 `work_package_c/schemas` 解析，不再依赖网络；
- `load_v3_group` 支持真实 v3 制品的 `layers` 数组形式（含 `planning_layer`），
  同时保留 dict 形式兼容；
- 新增真实制品回归 fixtures（initial/replanned）与 3 项测试（含 socket 阻断离线
  校验、initial/replanned 区分）；D 共 9 tests 通过。
