---
Overall Status: ACTIVE
Content Status:
  - COMPLETED
  - PLANNED
Document Role: SUPPORTING
Scope: work package D handoff
Branch: research-validation-system
Last Verified: 2026-08-31 00:19 +08:00
---

# 工作包 D 交接说明

> Status: CURRENT — Formal engineering route motion consumer（2026-08-31）
> 更新：2026-08-31。D 现为 **Viewer 唯一实现 owner**（HTML/JS/CSS、
> Simulation Clock UI、moving ship、静态 server、proof renderer），
> 消费 orchestrator `scripts/replay_viewer_export.py` 导出的稳定制品
> （`bundle.json` / `gebco_basemap.png` / `basemap_metadata.json`）。
> D 只消费 artifact，**不 import orchestrator 私有 Python 模块**。

## 当前基线

D 0.1.0 的 Legacy Display 只读消费 C 顶层
`cd.four-layer-route-plan-set.v3`（内含 `cd.route-plan.v3`）或
`cd.route-plan.v2` 后备，输出 `d.display-snapshot.v1`。当前 **Replay-driven Viewer** 不
直接读取 C 集合，而只消费 Orchestrator 的 `replay.viewer-bundle.v1`（`viewer/`：
`app.js`/`index.html`/`style.css` + `pngcodec.py`/`embed.py`/`render_proof.py`）。

Replay bundle 可在顶层携带 `cd.route-motion-set.v1`。D 对完整 canonical identity、四层
records、plan/full-waypoint digest、ETA 和 adoption 做严格校验；有效 artifact 默认同源驱动
路线、船位、航向、速度、trail 和 completed-track，失败整体回退 raw waypoint/timeline。
生产模式不再本地重算曲线；research sidecar 仍需研究视图显式启用。本路径只声明公式散货船
工程仿真，不声明实船校准、导航级 corridor 或 UKC。

## Viewer Product Mainline（2026-08-20 21:13 +08:00）

当前主线已经从 Viewer backend foundation 进入真实浏览器产品基线：

- Orchestrator export 从同一 manifest 目录的 immutable `risk-store/frames/`
  投影 13 个 replay-window 内的 `bc.risk-frame.v2` hourly frames；D 不读取
  原始 A/B 数据、不重算 risk；
- `bundle.json` 额外包含按 Simulation Time 预计算的 Current/+6h/+12h
  selection index；每项有 requested/actual valid time、actual horizon、
  selection method、availability 和 fail-closed reason；D 不扫描 risk store；
- D 的单一 `Simulation Clock` 同时驱动 vessel、risk、route、track、events；
  risk frame 规则是 `latest_valid_time_at_or_before_simulation_time`；
- hard reason 独立于 risk level，`LAND`、`DATA_UNAVAILABLE`、`OTHER` 不会被
  当作低风险/安全；
- 13:00/13:30 保持 active revision 1 + pending revision 2，15:00 才显示
  revision 2 adopted；completed track 保持 append-only；
- Engineering Debug toggle 保留 simulation/risk/replan/L1/L2 诊断，正式图面
  不堆叠调试文本。
- Presentation Mode 默认隐藏 Debug；Risk、Hard/Availability、Routes、
  Completed Track 可分别开关。
- 10:30 +6h 的实际 frame 是 16:00（+5h30m，floor）；10:30 +12h/+24h
  因 requested valid time 超出 22:00 frame 范围而 UNAVAILABLE，不复用旧 frame。
- Presentation polish（2026-08-21，路线平滑补充 2026-08-31 00:56）：风险填充使用
  presentation-only 的 pixel-aligned exact cells，Debug 保留 cell grid；计划路线使用
  可见的 display-only 局部受约束 cubic B-spline，失败回退到 collinear densification；
  蓝色曲线默认显示，白色原始折线可选且默认隐藏；Viewer 仿真船位、航向、近期轨迹和
  completed-track 绘制跟随曲线，原始 waypoint ETA 仍是时间锚点。
- Bundle 的 `presentation.viewer-presentation.v1` 由 Orchestrator 声明绘制
  边界：risk/hard 不插值，route display smoothing 不改变 authoritative semantics，
  Viewer ship position/heading 由曲线和原始 ETA 时间锚点驱动并在异常时回退 timeline；
  曲线不提供安全或操纵性资格。

真实 Firefox E2E：页面/GEBCO/路线/船/risk overlay 均可见；Play/Pause、scrub、
1x/2x/4x/8x 已操作；10:00/10:30/11:00 船位为
`70.3333/70.4135/70.4938`；console errors/warnings = 0，静态请求全部 200。
D 当前验证为 58 passed + ruff clean + JS syntax clean。

## RC1 冻结角色（2026-08-21 23:18）

真实 v3 initial/replanned 制品离线消费 PASS（r6/r7 输出均可生成 complete 快照）。

## 重要路径

- `src/arctic_route_display/loader.py`（离线 schema registry + layers 数组解析）
- `tests/fixtures/v3_initial.json` / `v3_replanned.json`
- 真实输出：`../work_package_a/data/output/golden/mur-v3-smoke-20260816-r6/r7/output/routes/v3/`

## 输入 / 输出

输入：v3 整组 JSON；输出：渲染快照 JSON（status/layers/group_id）。

## 历史静态 Loader 基线（2026-08-21 23:18）

以下为 Demo Candidate 2 的历史验收，不是当前测试总数：PASS（36 tests）；Viewer =
Demo Candidate 2（离线地图 + 交互 + Live API +
Route Geospatial Integrity badge）；`demo geo-integrity` 机器审计 48/48
frozen routes PASS；`demo preflight` 含 Route Geospatial Integrity 硬门；
Temporal Semantics 机器审计 PASS（38 tests，
`temporal-semantics-audit.json`）；Causal Feasibility 在 A 侧审计
（A 19h / B 44h 末期窗口）；demo-state/Viewer 现展示 scenario_mode 与
temporal provenance。

## 已知坑

- v3 `layers` 是数组不是 dict；schema `$id` 用 `arctic-route.local`，必须本地解析；
- 不允许读取 A/B 私有数据库或等待规划计算。
- Viewer 历史坑（已修复）：格子与路线曾使用两套投影，导致地理正确的路线
  在屏幕上穿过 LAND；修复后共用同一 `project()`，并有像素空间回归 oracle 测试。
- 时间语义要点（详见 `TEMPORAL_SEMANTICS_AUDIT_20260817.md`）：
  Viewer “Frame initial/replan” = risk 帧 valid_time（06:00Z/12:00Z），
  不是 simulation snapshot；145 帧不能直接当播放器帧；早期 demo-state
  不保存 as_of/scenario_mode，2026-08-17 已补（现保存并展示 scenario_mode
  / simulation_start/end / knowledge_as_of）；SimulationSnapshot 仍为
  下一阶段设计。

## 冻结决策

- 不修改 C 输出 contract；不把预计算制品冒充实时结果。

## 下一步

- Pre-demo final（完整答辩流程彩排、恢复演练、独立备份）；
- **NEXT PHASE（Viewer 产品开发主线）**：browser rehearsal → Demo Freeze
  （不再做 governance 修补轮）；
- v2 后备展示不进入 Demo 主线。

## Competition Demo Final Polish（2026-08-21 15:30 +08:00）

- 风险分布审计：`scripts/risk_distribution_audit.py` →
  `RISK_DISTRIBUTION_AUDIT.md`。当前正式制品为 13 个 hourly frames、31×11
  cells；水域 `NONE` 全为 Level 1，Level 5 只出现在 LAND/DATA_UNAVAILABLE
  hard cells，根因在 B target-grid/model output，不在 D threshold；
- Orchestrator export 增加 presentation-only grid/distribution summary，D
  用它渲染 Risk Forecast Timeline；B 的 risk formula、hard reason 和
  `bc.risk-frame.v2` 不变；
- unavailable horizon 现在显示明确的 fail-closed 文案与 formal forecast
  window；页面默认 Presentation Mode、paused at departure；新增 replay
  milestone panel；
- 没有可诚实消费的 Fastest/Low Risk/Recommended 三路线集合，也没有
  单因素风险/环境场 artifact，因此本轮不伪造这些层；当前 bundle 的五条
  route revision 仍按 authoritative/pending/superseded 语义展示；
- 本轮 Firefox、D tests/ruff/JS syntax 和 Orchestrator focused export tests
  均通过；没有重跑 replay、heavy integration 或修改 A/B/C/contracts。

## Competition Demo Freeze Validation（2026-08-21 17:15 +08:00）

- `DEMO_FREEZE_VALIDATION_REPORT.md`：既有 artifact 和独立复制的 `viewer/`
  均可由静态 server 启动，Firefox 验证 Presentation Mode、departure pause、
  Risk Timeline、milestones、ship movement、HTTP 200 与 console 0；
- Viewer 新增 Risk Forecast Summary，所有数字来自 Orchestrator 导出的
  frame summary；Risk trend 是 export 层的 first-to-last finite mean score
  presentation summary，不是新的 B 计算；
- Viewer 新增 Route Decision panel，展示现有 route revision、distance、
  endpoint ETA、已有 metrics 和真实 event trace；average/max risk 缺失时
  明确显示 `not published`；
- Orchestrator 导出 backward-compatible `route_candidates` 空接口。
  当前制品没有候选 geometry/metrics，Viewer 不伪造 Fastest/Low Risk/
  Recommended 比较；
- `ENVIRONMENT_LAYER_READINESS.md` 明确当前 bundle 没有 Sea Ice、Wind、
  Wave、Current、Temperature 或 contributor arrays，因此 D 不读取 A 私有
  数据、不绕过 presentation boundary。

## 常用命令

```bash
cd ${ARCTIC_ROUTE_ROOT}/work_package_d
./.venv/bin/python -m pytest -q
./.venv/bin/arctic-route-display snapshot --v3 <initial.json> --output out.json
./.venv/bin/arctic-route-display demo preflight
./.venv/bin/arctic-route-display demo geo-integrity
./.venv/bin/python scripts/temporal_semantics_audit.py
./.venv/bin/arctic-route-display demo build --config configs/demo_frozen_sources.json --output demo-state.json
./.venv/bin/arctic-route-display demo serve --state demo-state.json --port 8123
```

## 证据

`../work_package_a/data/output/golden/mur-v3-smoke-20260816-r6/r7/d-snapshot-*.json`。
`../work_package_a/data/output/rc2-smoke/demo-state.json`（含 spatial + phase_deltas）。
