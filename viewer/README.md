# Replay-driven Viewer（work_package_d 所有）

> Document Status: ACTIVE_CANONICAL
> Scope: work_package_d `viewer/` 实现与运行
> Canonical For: Replay-driven Viewer application（Simulation Clock / moving
> ship / route / completed track / pending adoption / GEBCO basemap）
> Branch: demo-engineering
> Last Verified: 2026-08-21

本目录归 **work_package_d** 所有。D 是 Display / Visualization / Presentation
所有者，负责渲染、时间轴 UI、船位与 route/track/pending 展示。业务语义（Planner、
Risk、Presentation Adapter、L1/L2 eligibility）由 orchestrator 与 contracts 负责，
Viewer 不重新解释、不猜航速、不修改 route geometry。

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

打开 `http://127.0.0.1:8131/`（Play/Pause、scrub、1x/2x/4x/8x、Current/
+6h/+12h/+24h horizon、layer toggles、Presentation/Engineering Debug mode）。

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

`Simulation Clock`（唯一主时间）；Play / Pause / scrub；1x/2x/4x/8x 只改变
`simulation seconds / wall-clock second`，不改变业务船速。Presentation Mode 显示
requested risk horizon、requested/actual risk valid time、actual horizon、
availability 和 risk/hard/route legend；Engineering Debug 面板额外显示
`simulation_time`、vessel lon/lat、speed knots、edge progress、active/pending
plan revision、decision/effective adoption time、selection method、risk frame
id、last event、L1/L2 status。切换 horizon 不改变 Simulation Time。

## 目录

```text
viewer/index.html         页面结构
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
  semantics、Hard Reason overlay、superseded route 绘制和两种展示模式。
- NEXT：更丰富但不改变业务语义的 replanning animation、demo rehearsal、
  Demo Freeze。
