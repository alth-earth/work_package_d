---
Overall Status: ACTIVE
Content Status:
  - COMPLETED
  - PLANNED
Document Role: CANONICAL
Scope: work_package_d viewer implementation and runtime
Branch: research-validation-system
Last Verified: 2026-08-23
---

# Navigation Decision Simulation Viewer（work_package_d 所有）

> Scope: work_package_d `viewer/` 实现与运行
> Canonical For: Navigation Decision Simulation Viewer application（Simulation Clock / moving
> ship / route / completed track / pending adoption / GEBCO basemap）
本目录归 **work_package_d** 所有。D 是 Display / Visualization / Presentation
所有者，负责渲染、voyage progress UI、船位与 route/track/pending 展示。业务语义（Planner、
Risk、Presentation Adapter、L1/L2 eligibility）由 orchestrator 与 contracts 负责，
Viewer 不重新解释、不猜航速、不修改 route geometry。

## Optional Risk Explanation（2026-08-23 21:51 +08:00）

Viewer 接受 presentation package 顶层可选 `risk_explanation`，其 schema 为
`risk-explanation.v1`；自包含测试/交付也可在启动前设置
`window.RISK_EXPLANATION_SIDECAR`。未提供 sidecar 时不发起额外网络请求，点击格点仍显示
RiskFrame 的 Risk Level、Risk Score、Confidence，并明确显示 `Explanation unavailable`。

`risk_explanation.js` 在启用解释前检查 schema、RiskWindow、run/scenario、RiskFrame id/time、
grid rows/columns/CRS、逐格坐标以及 RiskFrame 风险镜像。任一 mismatch 会拒绝整个 sidecar，
但不影响 RiskFrame、risk/hard layer、route 或 Simulation Clock。`PARTIAL` 只按 producer
顺序显示已发布 contributor，不补 wave/wind/ice 的零值或文案；`COMPLETE` 显示 producer
提供的 contributors/contribution/reason/uncertainty。面板从 RiskFrame 读取 risk level/score/
confidence，绝不使用 sidecar 覆盖。

当前 Firefox E2E 的 explanation 内容来自明确标记为 `synthetic/design_example` 的 B 测试
fixture，只验证 D consumer。真实 B producer 与 Orchestrator immutable transport 尚未发布。

## Winter Combined Package（2026-08-23 20:14 +08:00）

Winter Research Viewer 使用同一 package 中发布的：

```text
a-bundle-a2146dd0adbaa7db77a6beb7
run-441b03c8-d45b-5414-b0e8-b7fd0d990c22
risk-window-sha256-b5bed6bb48893e32620710e8c765dc60ec37a2fc384f0c49014b92f0a1c056b2
route-candidates-sha256-46baf02084d67ffe5b0b734b2ad1b27631b7970b6e25a28011cd917dd23a4ffd
```

`combined_presentation` 与 `risk.source`、`route_candidates.provenance`、
`research_validation` 必须一致，否则 Research View fail closed。航行时间线来自 C
selected full-voyage recommended route 的 waypoint ETA，标记为
`cd.route-plan.v3.waypoints.eta`；它不是 causal replay，不包含 replan event。RiskWindow
保留完整 145 个 hourly frames，risk/hard cell 均原样投影。

## 输入：Orchestrator Presentation Package

D 只消费 orchestrator 导出的稳定制品，不 import orchestrator Python 内部模块：

```text
bundle.json
gebco_basemap.png
basemap_metadata.json
replay-viewer-preflight.json
```

导出命令（orchestrator 负责）：

```bash
cd /root/my_project/arctic_route_orchestrator
./.venv/bin/python scripts/replay_viewer_export.py \
  /root/my_project/work_package_a/data/output/rc2-smoke/causal-replay-mvp/sb-viewer-baseline-12h-det/causal-replay-manifest.json \
  --data-root /root/my_project/work_package_a/data \
  --route-id tromso_to_isfjorden_outer \
  --output-dir /root/my_project/work_package_d/viewer
```

生成的 `bundle.json` / `gebco_basemap.png` / `basemap_metadata.json` /
`replay-viewer-preflight.json` 被 D `.gitignore` 忽略（本地制品，不提交）。

## 运行

标准离线静态服务（127.0.0.1，无 CDN / remote JS/CSS/fonts/tiles）：

```bash
cd /root/my_project/work_package_d
./.venv/bin/python scripts/replay_viewer_serve.py --root viewer --port 8131
```

打开 `http://127.0.0.1:8131/`（Run/Pause、Voyage Progress、1x/2x/4x/8x、Now/
+6h/+12h/+24h horizon、layer toggles、Research Validation / Navigation Simulation /
Engineering Debug mode）。

## Navigation Decision Simulation Phase 2（2026-08-23 18:11 +08:00）

默认 presentation UI 使用 `Run`、`Simulation Time`、`Voyage Progress` 和
`Simulation Speed`，不再将确定性仿真描述为媒体 playback。内部唯一主状态仍是
`simulation_time`；Voyage Progress 只是根据已发布 vessel timeline 预计算的累计航程
坐标。用户拖动公里轴时，Viewer 通过同一单调轨迹索引映射回 `simulation_time`，随后仍由
既有 `vesselPointAt(simulation_time)` 计算船位。

该展示坐标不计算或修改 route distance、ETA、risk metrics、candidate ranking、route
geometry 或 `selected_candidate_id`。如果 timeline 不能形成有效累计航程，控件 fail closed
回相对 Simulation Time。当前 frozen 48h bundle 的仿真窗口累计轨迹为约 865.2 km，初始
route artifact 发布 909.7 km；界面分别标注，禁止把未覆盖的航程伪装成已执行。

Research Validation 下的 Navigation Decision panel 继续直接展示
`presentation.route-candidates.v1` 的 `fastest`、`low_risk`、`recommended` 三目标；
`Current Strategy` 只引用 C 的 canonical `selected_candidate_id`。当前 frozen bundle 为
`NOT_PUBLISHED`，因此真实 Firefox 回归仍诚实显示 `SINGLE_ROUTE_FALLBACK`。

本轮完整证据见
[D_NAVIGATION_SIMULATION_PHASE2_REPORT.md](D_NAVIGATION_SIMULATION_PHASE2_REPORT.md)。

## Research Presentation Mode（2026-08-23 16:59 +08:00）

当 bundle 内 `route_candidates` 为合法的 `presentation.route-candidates.v1` PUBLISHED
package 时，Viewer 默认进入 `Research Validation`。该模式显示：

- 四个 planning layer selector；
- 每层 source-order 的 `fastest` / `low_risk` / `recommended` 三条路线；
- artifact 原样提供的 route ID、distance、travel hours、arrival ETA、average/max/
  integrated risk；
- source run、scenario、RiskFrame schema、grid、frame count、candidate set identity；
- candidate geometry 地图对比与 display-only highlight。

Research View 不修改 `selected_candidate_id`。若 sidecar 缺失、`NOT_PUBLISHED`、不满
4×3、scenario 不匹配、geometry/metrics 不完整或出现 hard violation，Research 选项禁用，
Viewer 明确回退为既有 authoritative 单路线。`DATA_UNAVAILABLE` 仍由独立 hard overlay
显示，不参与 route metric 推断。

研究验证分支的 `Navigation aids` 图层默认开启：经纬网格、坐标标签、按地图
中心纬度估算的比例尺，以及 north-up EPSG:4326 的 grid-north 指示。全部复用
`project(lon, lat)` 和 bundle 的 basemap metadata；不访问 A/B/C 私有数据。

Presentation Mode 仍逐 cell 消费 formal presentation bundle，但使用像素对齐
和较柔和 alpha，避免相邻透明 cell 的抗锯齿接缝；没有空间插值。Engineering
Debug 显示原始 cell 边界。路线绘制使用同一 authoritative waypoint 折线的线性
densification 和 round join，不产生新的弯曲几何。船图标中心仍由后端 ETA 与
Simulation Clock 决定，朝向来自 active route segment bearing。

无 server 单文件方式：

```bash
./.venv/bin/python viewer/embed.py --viewer-dir viewer
# 打开 viewer/index_self_contained.html
```

机器 proof PNG（不依赖浏览器）：

```bash
./.venv/bin/python viewer/render_proof.py --viewer-dir viewer --time 2026-08-15T10:30:00Z
```

## 业务原则（不可破坏）

```text
船必须动
Simulation Clock -> vessel motion
ship position = route waypoint ETA + simulation_time
snapshot cadence != render cadence
REPLAN_DECIDED != REPLAN_ADOPTED
pending route != authoritative route
completed track = append-only
replan 只改变未来
Viewer 不猜航速 / 不改 route geometry 掩盖 LAND；display densification 只在
authoritative straight segment 上增加绘制点
land_sea_mask: 1 = sea, 0 = land_or_coast
```

## 控件与 Debug

`Simulation Clock`（唯一主时间）；Run / Pause / Voyage Progress；1x/2x/4x/8x 只改变
`simulation seconds / wall-clock second`，不改变业务船速。Navigation Simulation 显示
requested risk horizon、requested/actual risk valid time、actual horizon、
availability 和 risk/hard/route legend；Research Validation 在合法 4×3 sidecar 上增加
实验 identity、layer/objective compare 与 candidate geometry；Engineering Debug 面板额外显示
`simulation_time`、vessel lon/lat、speed knots、edge progress、active/pending
plan revision、decision/effective adoption time、selection method、risk frame
id、last event、L1/L2 status。切换 horizon 不改变 Simulation Time。

## 目录

```text
viewer/index.html         页面结构
viewer/research_candidates.js  route candidate strict validation（browser + Node）
viewer/risk_explanation.js  optional risk explanation strict validation（browser + Node）
viewer/app.js             渲染 + timeline（只读 bundle）
viewer/style.css          样式
viewer/embed.py           单文件内嵌（bundle + basemap）
viewer/pngcodec.py        纯 Python PNG 编解码（offline proof）
viewer/render_proof.py    离线 proof 渲染（bundle + basemap）
scripts/replay_viewer_serve.py  D 静态 server + /api/state
```

## 迁移边界

- Orchestrator 保留：`replay/presentation.py`、`replay/geospatial.py`、
  `replay/preflight.py`、`scripts/replay_viewer_export.py`、
  `scripts/replay_viewer_preflight.py`、`scripts/replay_l2_preflight.py`。
- D 拥有：HTML/JS/CSS、Simulation Clock UI、ship/route/track/pending 渲染、
  GEBCO basemap 展示、静态 server、proof 渲染。
- 已完成：Current/+6h/+12h/+24h horizon selection、fail-closed unavailable
  semantics、Hard Reason overlay、superseded route 绘制、三种展示模式、专业
  navigation aids，以及真实 Winter 12-route sidecar 的 Phase 1 candidate compare。
- 已完成：Orchestrator 发布同一 Winter identity 的 combined risk/route/ETA-simulation
  package，Winter Research Firefox E2E PASS。
- NEXT：如需 Winter dynamic replanning，必须由正式 Winter causal replay/snapshots 发布；
  环境 contributor 图层仍需正式 presentation contract，D 不读取 A/B/C 私有数据补齐。
