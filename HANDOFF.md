# 工作包 D 交接说明

> Status: CURRENT — RC1（2026-08-16）

## Current baseline

D 0.1.0：只读消费 C 已发布的 `cd.four-layer-route-plan-set.v3`（或 v2 后备），
输出 `d.display-snapshot.v1`。

## RC1 role

真实 v3 initial/replanned 制品离线消费 PASS（r6/r7 输出均可生成 complete 快照）。

## Important paths

- `src/arctic_route_display/loader.py`（离线 schema registry + layers 数组解析）
- `tests/fixtures/v3_initial_rc1.json` / `v3_replanned_rc1.json`
- 真实输出：`../work_package_a/data/output/golden/mur-v3-smoke-20260816-r6/r7/output/routes/v3/`

## Inputs / Outputs

输入：v3 整组 JSON；输出：渲染快照 JSON（status/layers/group_id）。

## Current status

PASS（9 tests）；页面/交互 = TODO（Pre-demo optional）。

## Known traps

- v3 `layers` 是数组不是 dict；schema `$id` 用 `arctic-route.local`，必须本地解析；
- 不允许读取 A/B 私有数据库或等待规划计算。

## Frozen decisions

- 不修改 C 输出 contract；不把预计算制品冒充实时结果。

## Next work

- Live Demo 展示页与风险动画（读冻结结果）；
- 必要时支持 v2 后备展示。

## Useful commands

```bash
cd /root/my_project/work_package_d
./.venv/bin/python -m pytest -q
./.venv/bin/arctic-route-display snapshot --v3 <initial.json> --output out.json
```

## Evidence

`../work_package_a/data/output/golden/mur-v3-smoke-20260816-r6/r7/d-snapshot-*.json`。
