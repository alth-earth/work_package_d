# 比赛演示冻结校验报告

（2026-08-21 17:30 +08:00）

## 1. 关键差异

| 主张 | 之前 | 之后 | 证据 | 结论 |
|---|---|---|---|---|
| 演示冻结校验 | 此前的浏览器基线 | 全新的源包与独立副本 Firefox 校验 | `DEMO_FREEZE_VALIDATION_REPORT.md`、Firefox | PASS |
| 风险解释 | 仅时间线 | 风险摘要：均值/最大值、趋势、LAND、不可用、硬单元计数 | 当前包 + Firefox 面板 | PASS |
| C 路由解释 | 仅路由状态 | 路由决策：活动/待定修订、距离、ETA、已发布指标、事件轨迹 | Firefox 13:30/15:00 | PASS |
| 多路由对比 | 无真实候选集 | `route_candidates` 接口存在，为空且显式声明 | `bundle.json` | SAFE DEFER |
| 环境因子 | 无就绪度声明 | 就绪度报告记录了缺失字段与所需的未来契约 | `ENVIRONMENT_LAYER_READINESS.md` | NOT_READY / HONEST |
| 演示演练 | 既有的 3 分钟流程 | 新增摘要与路由决策旁白 | `DEMO_REHEARSAL.md` | PASS |

```text
DEMO_FREEZE = YES
```

该判定针对当前确定性的离线制品，并不声称缺失的候选路由或缺失的环境因子数组已被实现。

## 2. 冻结边界与制品

- 正式制品：
  `/root/my_project/work_package_a/data/output/rc2-smoke/causal-replay-mvp/sb-viewer-baseline-12h-det/`
- 查看器包：`/root/my_project/work_package_d/viewer/`
- 包模式：`replay.viewer-bundle.v1`
- 时间线：721 个一分钟条目，2026-08-15 10:00Z–22:00Z
- 风险：13 个逐时 `presentation.risk-overlay.v1` 帧，31×11=341 单元
- D 仍是唯一的查看器运行时所有者。
- 编排器仍是展示导出/预检所有者。

未改动且不修改：

```text
work_package_a
work_package_b
work_package_c
arctic_route_contracts

B 风险公式与层级策略
C 规划器核心与路由语义
ETA 与船舶运动语义
回放时间线与事件语义
延迟采纳与已完成航迹语义
```

## 3. 冻结校验

源包通过以下命令提供：

```bash
cd /root/my_project/work_package_d
.venv/bin/python scripts/replay_viewer_serve.py \
  --root viewer --host 127.0.0.1 --port 8131
```

为验证副本独立性，完整的 `viewer/` 目录被复制到
`/root/my_project/.runtime/freeze-copy-final-20260821/` 并在端口 8133 提供。
该副本在加载时无需源仓库导入，也无需额外部署服务。

对最终副本包执行的全新 Firefox 校验确认：

- 默认展示模式；工程调试面板隐藏；
- 页面暂停在回放出发时刻（`10:00`，播放按钮可见）；
- GEBCO 底图、风险/硬图层、路由、已完成航迹、船舶、
  风险预报时间线、风险摘要、路由决策与里程碑均存在；
- 所需静态资源（`index.html`、`style.css`、`app.js`、`bundle.json`、
  `favicon.svg`、`gebco_basemap.png`）均返回 HTTP 200；
- 控制台错误 = 0；控制台警告 = 0。

## 4. 风险摘要

该面板仅消费编排器导出的元数据，不扫描原始气象数据，也不重新计算 B 风险。

在当前 / 10:00：

```text
mean score              0.055984
maximum score           0.151060
forecast trend          decreasing
LAND cells              65
DATA_UNAVAILABLE cells  21
hard cells total        86
published cells         341
```

预报趋势是一个导出层的描述性摘要，使用第一个到最后一个有限发布的均值分数：`0.047120 - 0.055984 = -0.008863`。它不是新的风险计算或阈值策略。

该面板明确解释：已发布的 `NONE` 水域单元上的 1 级是低风险评估。`LAND` 与 `DATA_UNAVAILABLE` 仍保持独立的硬/可用性语义，绝不会被渲染为安全。

## 5. 路由决策

该面板使用已发布的路由修订与事件列表：

```text
Initial:
  R1 authoritative
  distance = 909.7 km
  arrival ETA = 2026-08-17T12:27:16.172062Z
  average/max risk = not published

13:30:
  REPLAN_DECIDED
  active R1, pending R2
  R1 remains authoritative

15:00:
  REPLAN_ADOPTED R2
  active R2, pending R3
  event trace preserves the artifact ordering:
  REPLAN_ADOPTED R2 → REPLAN_DECIDED R3
```

该面板不会将路由修订转变为最快/低风险/推荐候选对比。当前包新增：

```json
"route_candidates": {
  "schema_version": "presentation.route-candidates.v1",
  "status": "NOT_PUBLISHED",
  "candidates": []
}
```

因此查看器保留单一权威路由，并声明候选对比不可用。

## 6. 环境图层就绪度

[ENVIRONMENT_LAYER_READINESS.md](ENVIRONMENT_LAYER_READINESS.md) 记录了只读审计。当前展示包没有可用于展示的数组，覆盖海冰、风、浪、海流、温度或逐单元贡献因子。未添加任何合成因子图层。

未来的因子图层需要一个展示契约，包含有效时间、选择/可用性、规范坐标、单位、溯源，以及明确的失败关闭行为。总风险与单个因子必须保持分离。

## 7. 演示演练

[DEMO_REHEARSAL.md](DEMO_REHEARSAL.md) 现叙述如下：

```text
map and clock
→ continuous ship motion
→ +6h risk summary / valid time
→ current risk at 13:00
→ R2 pending at 13:30
→ R2 adopted and R3 pending at 15:00
→ summary, route decision, milestones, and debug toggle
```

操作员不应声称当前制品包含三方目标对比或单因子环境贡献。

## 8. 修改的文件

### D

- `viewer/index.html`
- `viewer/app.js`
- `viewer/style.css`
- `tests/unit/test_replay_viewer_bundle.py`
- `DEMO_REHEARSAL.md`
- `README.md`
- `HANDOFF.md`
- `CHANGELOG.md`
- `scripts/risk_distribution_audit.py` 及其既有审计报告仍作为产品证据的一部分；
- `DEMO_FREEZE_VALIDATION_REPORT.md`
- `ENVIRONMENT_LAYER_READINESS.md`
- 本报告。

### 编排器

- `scripts/replay_viewer_export.py`
- `tests/unit/test_replay_viewer_export.py`
- `README.md`
- `CHANGELOG.md`
- 基于既有清单重新生成 `work_package_d/viewer/bundle.json`；
  未执行任何回放。

运行时截图保存在
`/root/my_project/.runtime/viewer-proof/` 下，不打算作为 Git 输入。

## 9. 测试与校验层级

| 检查 | 结果 | 层级 |
|---|---:|---|
| D 完整 pytest | 58 passed | `UNIT_PASS` |
| D Ruff | clean | `UNIT_PASS` |
| `node --check viewer/app.js` | pass | `SMOKE_PASS` |
| 编排器聚焦导出测试 | 7 passed | `UNIT_PASS` |
| 编排器导出 Ruff | clean | `SMOKE_PASS` |
| 既有制品导出 | preflight PASS, L2 PASS, timeline 721 | `REAL_ARTIFACT_HTTP_SMOKE_PASS` |
| 源包 Firefox | map/UI/controls/state 检查通过 | `BROWSER_E2E_PASS` |
| 独立副本包 Firefox | 相同检查通过 | `BROWSER_E2E_PASS` |
| 13:30 路由状态 | active R1, pending R2 | `REAL_E2E_PASS` |
| 15:00 路由状态 | active R2, pending R3 | `REAL_E2E_PASS` |
| 12h 确定性双跑 | 继承，未重跑 | `AUTHORITATIVE_PASS` / `FROZEN_BASELINE` |

最终副本包上的浏览器运动证据：

```text
10:00 latitude = 70.3333333
350ms Play at 1x latitude = 70.3338017
delta = +0.0004684 degrees
button sequence = Play → Pause → Play
pixel speed = NO
```

位置仍由时间线/后端 ETA 加仿真时钟决定。

## 10. 性能与耗时分析

这些是 WSL 本地观测结果，并非专业基准。

### 浏览器/包

最终副本包 Firefox 预热导航观测：

| 指标 | 观测 |
|---|---:|
| DOMContentLoaded | 27 ms |
| load event | 28 ms |
| `bundle.json` 编码体 | 1,442,876 B |
| `app.js` 编码体 | 43,718 B |
| `style.css` 编码体 | 7,681 B |
| GEBCO PNG 编码体 | 13,938 B |
| 风险帧/单元 | 13 / 341 |
| 时界切换 | 无明显卡顿；船舶时钟不变 |

新增的摘要元数据相对包体很小。浏览器仍然消费展示就绪的摘要，而非在每帧动画中处理原始网格。

### 本轮命令

- 基于既有清单/快照的展示导出：墙钟时间 1.92 s，最大 RSS 141,820 KB；
- D pytest：1.11 s；
- 编排器聚焦测试：0.34 s；
- 未启动重型回放、12h 双跑、24h 回放或完整集成。

历史回放/集成耗时仍为继承基线，不与查看器加载时间混用：

- 权威 12h 基线：约 2044.9 s / 34.1 min，继承；
- 此前完整集成套件：约 2495.25 s / 41:35，继承；
- 近期产品集成套件：约 2334.71 s / 38:54，继承。

## 11. Git 与冻结状态

未执行任何 commit、reset、rebase、merge 或 push。

本轮开始与结束的 HEAD 保持不变：

| 仓库 | 分支 | 开始 = 结束 HEAD | 最终状态 |
|---|---|---|---|
| governance | `demo-engineering` | `234573d` | clean |
| contracts | `demo-engineering` | `7e83182` | clean |
| orchestrator | `demo-engineering` | `a404564` | dirty，仅展示导出/文档/测试 |
| A | `demo-engineering` | `c6d0718` | clean |
| B | `demo-engineering` | `6269420` | clean |
| C | `demo-engineering` | `42e951c` | clean |
| D | `demo-engineering` | `9ccabba` | dirty，仅 Viewer/文档/测试/报告 |

实际文件系统当前没有 `/root/my_project/.git` 目录；
上述嵌套的子仓库是本轮使用的 Git 仓库。未写入任何 Git 状态。

```text
PUSH = NOT PERFORMED
```

## 12. 剩余限制与比赛建议

剩余限制：

1. 没有用于最快、低风险、推荐三方对比的真实候选几何/指标。
2. 没有展示就绪的海冰/风/浪/海流/温度数组。
3. 除已发布帧摘要与硬原因计数外，没有基于贡献因子的风险解释。
4. 正式风险网格按设计仍为粗粒度；D 的任何插值都不改变其语义。

比赛建议：

- 展示因果链、风险摘要、连续船舶运动，以及延迟的 replan 采纳；
- 若被问及预报范围，使用显式的不可用状态作为失败关闭行为的证据；
- 不要为本制品声称多目标路由对比或环境因子图层；
- 为比赛演练冻结当前演示包。

```text
DEMO_FREEZE = YES
```
