# 工作包 D：只读展示层（骨架）

> 状态：**RC1 真实制品消费 PASS（2026-08-16）**。v3 整组/ v2 后备的读取、分组、
> 状态机与渲染摘要已实现并消费真实 r6/r7 输出（initial + replanned）；离线本地
> schema registry 与 `layers` 数组解析已修复；具体地图/交互页面待后续实现。
> RC2：新增 `planning-coverage-preflight.json` 消费（`coverage` 子命令 / `snapshot --coverage`）；
> Demo Candidate 1：`demo preflight/build/run-live/serve` + 本地只读 viewer。
> Demo Candidate 2：viewer 增加离线经纬度地图（真实风险帧坐标）、
> Availability/Risk 图层、Scenario A/B 交互、Compare initial→replanned 真实 delta、
> Live 按钮 + 进度反馈（`/api/live/start` / `/api/live/status`），仍无任何外部依赖。
> Route Geospatial Integrity（2026-08-17）：机器审计 48/48 冻结路线 PASS，
> 修复 Viewer 双投影导致的视觉穿 LAND，gate 并入 `demo preflight`；
> 见根目录 `ROUTE_GEOSPATIAL_INTEGRITY_AUDIT_20260817.md`。
> Temporal Semantics Audit（2026-08-17）：`scripts/temporal_semantics_audit.py`
> 机器审计冻结制品时间语义（145 帧 = 单一 knowledge 快照 × valid_time、
> +6h replan = 同窗后缀重规划），产物
> `temporal-semantics-audit.json`；见根目录
> `TEMPORAL_SEMANTICS_AUDIT_20260817.md`。
> Causal Replay Feasibility（2026-08-17）：A 侧
> `scripts/causal_replay_feasibility_audit.py` 输出
> `causal-replay-feasibility.json`（A 19h / B 44h 末期因果窗口）；
> demo-state 与 Viewer 增加 `scenario_mode`/simulation/knowledge_as_of
> 诚实展示。见 `CAUSAL_REPLAY_FEASIBILITY_AUDIT_20260817.md`。
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
- [D 展示层选型评估](../D_SELECTION_EVALUATION_v2_vs_v3.md)
- [顶层系统权威](../ARCTIC_ROUTE_SYSTEM.md)
