---
Overall Status: ACTIVE
Content Status:
  - COMPLETED
  - PLANNED
Document Role: CANONICAL
Applicability: CURRENT
Scope: work_package_d viewer implementation and runtime
Branch: research-validation-system
Last Verified: 2026-09-02 02:40 +08:00
---

> **路径约定（2026-08-24）**：本文件中 `${ARCTIC_ROUTE_ROOT}` 为工作区根占位符，
> 指向包含各工作包目录（`arctic_route_contracts/`、`work_package_a/` 等）的公共根。
> 解析优先级：环境变量 > 当前所在目录 > `$HOME`。完整定义见
> `arctic_route_governance/README.md` 的"路径约定"章节。

# Navigation Decision Simulation Viewer（work_package_d 所有）

> Scope: work_package_d `viewer/` 实现与运行
> Canonical For: Navigation Decision Simulation Viewer application（Simulation Clock / moving
> ship / route / completed track / pending adoption / GEBCO basemap）
本目录归 **work_package_d** 所有。D 是 Display / Visualization / Presentation
所有者，负责渲染、voyage progress UI、船位与 route/track/pending 展示。业务语义（Planner、
Risk、Presentation Adapter、L1/L2 eligibility）由 orchestrator 与 contracts 负责，
Viewer 不重新解释、不猜航速、不修改 route geometry。

## Optional Risk Explanation（2026-08-23 21:51 +08:00）

> 本节保留消费者契约的历史起点；当前默认原始冻结身份没有 B sidecar，缺失/错配仍保持
> 同一 fail-closed 语义。

Viewer 接受 presentation package 顶层可选 `risk_explanation`，其 schema 为
`risk-explanation.v1`；自包含测试/交付也可在启动前设置
`window.RISK_EXPLANATION_SIDECAR`。当前默认 Winter 包未嵌入 sidecar：精确 A source trace
已经退役，不能从 RiskFrame 反推，也不能复用其他 holdout 的制品。未提供 sidecar、身份
校验失败或选中格点没有任何有限 component 时，不发起额外网络请求并明确显示
`Explanation unavailable`。

`risk_explanation.js` 在启用解释前检查 schema、RiskWindow、run/scenario、RiskFrame id/time、
grid rows/columns/CRS、逐格坐标以及 RiskFrame 风险镜像。任一 mismatch 会拒绝整个 sidecar，
但不影响 RiskFrame、risk/hard layer、route 或 Simulation Clock。`PARTIAL` 只按 producer
顺序显示已发布 contributor，不补 wave/wind/ice 的零值或文案；`COMPLETE` 显示 producer
提供的 contributors/contribution/reason/uncertainty。面板从 RiskFrame 读取 risk level/score/
confidence，绝不使用 sidecar 覆盖。

consumer 测试继续覆盖明确标记为 `synthetic/design_example` 的 B fixture；producer 与
Orchestrator transport 的 manifest/digest/identity 门禁不变，但当前默认包按真实缺失降级，
不能把其他身份的工程链当作本包已可解释，更不能当作科学标定。

## Replay event fixture 诊断（2026-09-02）

当前默认 Winter bundle 是真实同身份的事后动态回放，包含 119 个事件和 8 组
`REPLAN_DECIDED`/`REPLAN_ADOPTED`。D bundle 测试在动态包中要求这两类事件；如果读取的是
不含 causal/dynamic replay event 的历史 fixture，测试才会以明确原因 `skip`，不伪造事件，
也不把 skip 当作运行时失败。strict causal replay 仍保持 fail-closed，不能用该历史 fixture
冒充实时因果证据。

## 双航线正式 Viewer 包并存（2026-09-02 01:35 +08:00）

`viewer/` 目录目前装载 B 航线（Tromsø→Isfjorden）Winter 制品；A 航线
（Murmansk→Dikson）正式 viewer 包独立存放于 `output/formal-motion-murmansk-viewer-package-v1/`，
两者是等齐的双航线正式交付（同一 `replay.viewer-bundle.v1` / `presentation.winter-combined-viewer.v1`
schema），互不覆盖：

| 航线 | viewer 包路径 | scenario | formal motion |
|---|---|---|---|
| A | `output/formal-motion-murmansk-viewer-package-v1/` | `murmansk_dikson_august_2026_demo_v1` | provided（四层 `cd.route-motion-set.v1`） |
| B（默认） | `viewer/` | `tromso_isfjorden_february_2026_research_v1` | provided（R1–R4 CURVE；R5–R9 fail-closed raw） |

切换展示时以 `--output-dir` 指向对应目录即可。A 航线包仍保留
`UNAVAILABLE_IDENTITY_BOUND_CAUSAL_REPLAY_REQUIRED`；B 默认包则消费真实、同身份的
`retrospective_dynamic_replay`，展示 9 个 revision 和 8 次真实采用，但明确不冒充 strict
causal replay。A 航线包详细身份与派生链路见 `../README.md`「双航线正式 Viewer 包」章节。

## Winter Combined Package（2026-08-23 20:14 +08:00）

Winter Research Viewer 使用同一 package 中发布的：

```text
a-bundle-a2146dd0adbaa7db77a6beb7
run-441b03c8-d45b-5414-b0e8-b7fd0d990c22
risk-window-sha256-b5bed6bb48893e32620710e8c765dc60ec37a2fc384f0c49014b92f0a1c056b2
route-candidates-sha256-46baf02084d67ffe5b0b734b2ad1b27631b7970b6e25a28011cd917dd23a4ffd
```

`combined_presentation` 与 `risk.source`、`route_candidates.provenance`、
`research_validation` 必须一致，否则 Research View fail closed。没有同身份 causal replay
时，航行时间线来自 C selected full-voyage recommended route 的 waypoint ETA，标记为
`cd.route-plan.v3.waypoints.eta`，且 bundle 明确标记
`UNAVAILABLE_IDENTITY_BOUND_CAUSAL_REPLAY_REQUIRED`，不含伪造 replan event。传入真实身份
绑定回放后，才显示多 revision 的 pending/superseded 与真实
`REPLAN_DECIDED/REPLAN_ADOPTED`。RiskWindow 保留完整 145 个 hourly frames，risk/hard cell
均原样投影。

## 输入：Orchestrator Presentation Package

D 只消费 orchestrator 导出的稳定制品，不 import orchestrator Python 内部模块：

```text
bundle.json
gebco_basemap.png
basemap_metadata.json
replay-viewer-preflight.json
optional: risk_explanation + risk-explanation-transport.v1
```

导出命令（orchestrator 负责）：

```bash
cd ${ARCTIC_ROUTE_ROOT}/arctic_route_orchestrator
./.venv/bin/python scripts/replay_viewer_export.py \
  ${ARCTIC_ROUTE_ROOT}/work_package_a/data/output/rc2-smoke/causal-replay-mvp/sb-viewer-baseline-12h-det/causal-replay-manifest.json \
  --data-root ${ARCTIC_ROUTE_ROOT}/work_package_a/data \
  --route-id tromso_to_isfjorden_outer \
  --output-dir ${ARCTIC_ROUTE_ROOT}/work_package_d/viewer
```

Winter combined export additionally accepts `--winter-replay-manifest PATH`
(`--winter-replay-snapshots-dir PATH` only when snapshots are copied) and
`--risk-explanation-manifest PATH`. The first is required for real
`REPLAN_DECIDED/REPLAN_ADOPTED` presentation; the second is the B immutable sidecar transport.

生成的 `bundle.json` / `gebco_basemap.png` / `basemap_metadata.json` /
`replay-viewer-preflight.json` 被 D `.gitignore` 忽略（本地制品，不提交）。

## 运行

标准离线静态服务（127.0.0.1，无 CDN / remote JS/CSS/fonts/tiles）：

```bash
cd ${ARCTIC_ROUTE_ROOT}/work_package_d
./.venv/bin/python scripts/replay_viewer_serve.py --root viewer --port 8131
```

打开 `http://127.0.0.1:8131/`（Run/Pause、Voyage Progress、1x/2x/4x/8x、Now/
+6h/+12h/+24h horizon、layer toggles、Research Validation / Navigation Simulation /
Engineering Debug 由“工程调试”按钮进入）。下拉框只保留 Research Validation /
Navigation Simulation 两种用户视图。

## A→D 跨包状态摘要（2026-09-02）

默认侧栏新增 `A→D 跨包状态`，把当前 Viewer 正在消费的四类发布制品放在同一处：

- A：DatasetBundle 身份；
- B：RiskFrame 帧数、网格、时域与 provenance；
- C：四层×三目标候选集、当前路线与运行锁定状态；
- D：formal motion / raw fallback、revision 与 adoption 摘要。

该摘要只读取 `bundle.json` 已发布字段，不重算风险、路线、ETA 或运动学。C 的
`selection-rationale.v1` 仍是可选 sidecar：存在且通过 scenario/run identity 校验时显示
推荐路线相对最快基线的距离、ETA 与风险权衡；缺失或无效时只在该卡片内降级，不阻塞路线消费。

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
[D_NAVIGATION_SIMULATION_PHASE2_REPORT.md](../archive/performance/D_NAVIGATION_SIMULATION_PHASE2_REPORT.md)。

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
Debug 显示原始 cell 边界。路线绘制优先使用 C 发布且身份校验通过的
`cd.route-motion-set.v1` `motion_samples`，失效时回退 authoritative waypoint/timeline；
D 不在生产路径本地重算 cubic B-spline，也不放大正式平滑幅度。Viewer 仿真船位、航向、
近期轨迹和 completed-track 使用同一正式 motion，原始 waypoint ETA 作为时间锚点；路线
authority、route metrics、ETA、active/pending/adopted 事件和 C→D 合同不变。图层控件默认
显示蓝色正式曲线路径，并默认隐藏白色原始折线路径；后者可按需打开作对照。

Replay Viewer 和旧版 `web/demo_viewer.html` 都只改变路线线条的 paint geometry；Replay
Viewer 额外让仿真船沿该展示曲线移动，但不把曲线写回 route artifact，也不改变原始
waypoints、route metrics、ETA 或 active/pending/adopted 语义。该效果不构成船舶操纵性、
安全走廊或生产资格证明。旧版 viewer 因为必须单文件离线运行，在内联脚本中保留了同一
局部 cubic path 的紧凑实现。

无 server 单文件方式：

```bash
./.venv/bin/python viewer/embed.py --viewer-dir viewer
# 打开 viewer/index_self_contained.html
```

机器 proof PNG（不依赖浏览器）：

```bash
./.venv/bin/python viewer/render_proof.py --viewer-dir viewer --time 2026-08-15T10:30:00Z
```

## 正式工程曲线运动（2026-08-31）

bundle 顶层可包含一个或多个 `cd.route-motion-set.v1`。D 启动时严格校验 canonical
`motion_set_id`、四层固定顺序、plan 和完整 waypoint/ETA/推荐速度 digest、RiskWindow、
curve/motion digest、ETA 单调性与 adoption 起终点。验证使用独立的规范化 SHA-256 与异步
预校验并冻结 artifact；有效正式 motion 没有生产开关，默认同时驱动蓝色路线、船位、
producer course/speed、近期 trail 和 completed-track。

缺失、陈旧、顺序/身份不符、digest 篡改、非单调 ETA 或 `RAW_PASSTHROUGH` 时，整条活动
路线稳定回退原始 waypoint/timeline；界面显示具体原因。生产路径不调用 D 本地 cubic
smoother，也不会重算 ETA、风险、hard mask、corridor 或运动学。这里的“正式”只表示工程
仿真 C→D 合同通过；profile 仍为 `FORMULA_DERIVED_ENGINEERING_REFERENCE`、
`real_vessel_calibrated=false`，不表示实船校准、导航认证或 UKC。

“当前路段”是独立 operational overlay，不受原始折线图层开关影响；有正式
`motion_samples` 时按当前 segment 的 ETA 窗口截取曲线，否则回退当前 raw segment。常规
图层区不再显示低辨识度的局部放大面板；最小曲率半径和相对权威航点的最大真实偏离仍
保留在正式 motion 诊断数据中，不改变正式 geometry、安全门禁或平滑幅度。Risk Forecast Timeline 保留完整
小时帧；窄侧栏通过横向滚动和最小 tick/bar 宽度保证绿色/黄色柱可见，`make
browser-regression` 覆盖 344px 与 528px。

## 受约束研究曲线运动（2026-08-31，历史兼容）

没有有效正式 motion 时，生产视图直接回退 raw timeline；D 本地 display-only 曲线和
研究 sidecar 都不再接管生产路径。研究 reader 只为历史 bundle 的离线兼容和独立测试保留，
默认 Viewer 不加载，也不提供“启用研究曲线运动”运行开关。

sidecar 缺失、身份不匹配、状态不是 `ACCEPTED` 或样本非法时，历史 reader 回退既有
timeline，不把 display-only 曲线当作研究曲线后备。该 sidecar 当前是 C 的
`GEOMETRY_ONLY` 研究输出，未重算 RiskFrame、hard mask、coverage、正式 ETA、船舶操纵性
或资源资格；因此研究开关不改变 `cd.route-plan.v2/v3`、route metrics、replan adoption、
生产数据流或 frozen artifact，也不代表实际船舶控制。

```bash
cd ${ARCTIC_ROUTE_ROOT}/arctic_route_orchestrator
./.venv/bin/python scripts/replay_viewer_export.py \
  --winter-plan-set PATH \
  --route-smoothing-sidecar PATH \
  ...
```

默认单文件离线 Viewer 只内联正式 `route_motion.js`；历史 sidecar 不进入默认内联路径。

## 业务原则（不可破坏）

```text
船必须动
Simulation Clock -> vessel motion
ship position = formal producer motion when identity-validated -> otherwise raw timeline;
research sidecar is historical compatibility only and never production fallback
snapshot cadence != render cadence
REPLAN_DECIDED != REPLAN_ADOPTED
pending route != authoritative route
completed track = append-only
replan 只改变未来
Viewer 不猜航速 / 不改 route geometry 掩盖 LAND；formal motion samples 是曲线来源，
失效时只在 authoritative straight segment 上做绘制 densification
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
viewer/research_route_motion.js  C research smoothing sidecar strict reader（browser + Node）
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
  semantics、Hard Reason overlay、superseded route 绘制、两种用户展示模式与工程调试按钮、专业
  navigation aids，以及真实 Winter 12-route sidecar 的 Phase 1 candidate compare。
- 已完成：Orchestrator 发布同一 Winter identity 的 combined risk/route/ETA-simulation
  package，Winter Research Firefox E2E PASS。
- 已完成：真实 Winter retrospective dynamic replay 已由 Orchestrator 发布并通过 Viewer E2E；
  若要升级为 strict causal，仍必须取得 issue-time 可追溯的 Winter causal replay/snapshots。
  环境 contributor 图层仍需正式 presentation contract，D 不读取 A/B/C 私有数据补齐。
