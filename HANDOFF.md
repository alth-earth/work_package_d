# 工作包 D 交接说明

> Status: CURRENT — Replay-driven Viewer adoption（2026-08-20）
> 更新：2026-08-20。D 现为 **Viewer 唯一实现 owner**（HTML/JS/CSS、
> Simulation Clock UI、moving ship、静态 server、proof renderer），
> 消费 orchestrator `scripts/replay_viewer_export.py` 导出的稳定制品
> （`bundle.json` / `gebco_basemap.png` / `basemap_metadata.json`）。
> D 只消费 artifact，**不 import orchestrator 私有 Python 模块**。

## 当前基线

D 0.1.0：只读消费 C 已发布的 `cd.four-layer-route-plan-set.v3`（或 v2 后备），
输出 `d.display-snapshot.v1`；并运行 **Replay-driven Viewer**（`viewer/`：
`app.js`/`index.html`/`style.css` + `pngcodec.py`/`embed.py`/`render_proof.py`）。

## RC1 角色

真实 v3 initial/replanned 制品离线消费 PASS（r6/r7 输出均可生成 complete 快照）。

## 重要路径

- `src/arctic_route_display/loader.py`（离线 schema registry + layers 数组解析）
- `tests/fixtures/v3_initial_rc1.json` / `v3_replanned_rc1.json`
- 真实输出：`../work_package_a/data/output/golden/mur-v3-smoke-20260816-r6/r7/output/routes/v3/`

## 输入 / 输出

输入：v3 整组 JSON；输出：渲染快照 JSON（status/layers/group_id）。

## 当前状态

PASS（36 tests）；Viewer = Demo Candidate 2（离线地图 + 交互 + Live API +
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
- **NEXT PHASE（Viewer 产品开发主线）**：Dynamic Risk Overlay → Hard Reason
  Overlay → Superseded/Replanning Animation → Browser Rehearsal →
  Presentation Polish → Demo Freeze（不再做 governance 修补轮）；
- v2 后备展示不进入 Demo 主线。

## 常用命令

```bash
cd /root/my_project/work_package_d
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
