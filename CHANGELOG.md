# 工作包 D 变更记录

## Unreleased - 2026-08-16（RC1）

- `loader._validate` 改为本地 referencing Registry：`arctic-route.local` schema
  引用从本地 `work_package_c/schemas` 解析，不再依赖网络；
- `load_v3_group` 支持真实 v3 制品的 `layers` 数组形式（含 `planning_layer`），
  同时保留 dict 形式兼容；
- 新增真实制品回归 fixtures（initial/replanned）与 3 项测试（含 socket 阻断离线
  校验、initial/replanned 区分）；D 共 9 tests 通过。
