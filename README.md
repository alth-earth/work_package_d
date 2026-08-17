# 工作包 D：只读展示层（骨架）

> 状态：**RC1 真实制品消费 PASS（2026-08-16）**。v3 整组/ v2 后备的读取、分组、
> 状态机与渲染摘要已实现并消费真实 r6/r7 输出（initial + replanned）；离线本地
> schema registry 与 `layers` 数组解析已修复；具体地图/交互页面待后续实现。
> RC2：新增 `planning-coverage-preflight.json` 消费（`coverage` 子命令 / `snapshot --coverage`）；
> Demo Candidate：`demo preflight/build/run-live/serve` + 本地只读 viewer。
> 主线口径：v3 四层 × 三目标（12 路线整组）+ 重规划为演示主线，v2 三目标为强制后备
> （2026-08-15 确认）。

D 只消费 C 已发布的原子制品，不调用 A/B/C 内部函数、不持有计算锁、不反向修改计算事实。

## 边界

- 输入：`cd.four-layer-route-plan-set.v3`（整组）或 `cd.route-plan.v2`（后备）的 JSON 文件；
- 输出：供展示层使用的“渲染摘要/状态”JSON；
- 不允许：读取 A/B 私有数据库、等待规划计算、消费不完整整组、跨代次拼接。

## 快速使用

```bash
cd /root/my_project/work_package_d
make sync
make check
arctic-route-display snapshot --v3 /path/to/routes/v3/initial.json --output out/snapshot.json
arctic-route-display coverage /path/to/planning-coverage-preflight.json
arctic-route-display demo preflight
arctic-route-display demo build --config configs/demo_frozen_sources.json --output demo-state.json
arctic-route-display demo run-live --config configs/demo_frozen_sources.json --output live-result.json
arctic-route-display demo serve --state demo-state.json --port 8123
```

## RC1 事实

- 离线 schema：`work_package_c/schemas/four-layer-route-plan-set-v3.schema.json`
  （`arctic-route.local` 引用本地解析，不需要网络）；
- 真实制品 fixtures：`tests/fixtures/v3_initial_rc1.json` / `v3_replanned_rc1.json`；
- 测试：12 tests（含断网回归、initial/replanned 可区分、coverage preflight）。

## 结构

- `src/arctic_route_display/models.py`：`RouteSetView`、`LayerView`、`DisplayState`；
- `src/arctic_route_display/loader.py`：读取/分组 v3 整组与 v2 后备，可选用 C Schema 校验；
- `src/arctic_route_display/cli.py`：`snapshot` 与 `coverage` 命令；
- `src/arctic_route_display/demo/`：Demo Data Model、Frozen/Live loader、preflight；
- `web/demo_viewer.html`：本地只读 viewer（localhost，无 CDN，离线）；
- `configs/demo_frozen_sources.json`：frozen A/B 与 live smoke 来源配置；
- `tests/`：状态机与分组测试。

## 相关文档

- [C→D 合同](../work_package_c/docs/CD_CONTRACT.md)
- [D 展示层选型评估](../D_SELECTION_EVALUATION_v2_vs_v3.md)
- [顶层系统权威](../ARCTIC_ROUTE_SYSTEM.md)
