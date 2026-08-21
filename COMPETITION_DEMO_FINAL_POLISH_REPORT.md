# Competition Demo Final Polish 阶段报告

（2026-08-21 15:30 +08:00）

## 1. Key Delta

| 项目 | 本轮前 | 本轮后 | 证据 | 结论 |
|---|---|---|---|---|
| 风险分布根因 | 视觉上 Level 1/2 偏多，原因未机器化 | 13 个正式帧逐帧统计；`NONE` 水域 255/255 为 L1，hard 格 86 个为 L5 | [RISK_DISTRIBUTION_AUDIT.md](RISK_DISTRIBUTION_AUDIT.md) | 根因在 B target-grid/model output，不是 D 颜色阈值 |
| unavailable horizon | fail-closed 但文案简短，缺少 forecast window | 明确显示 `Risk Forecast unavailable` 和 formal available window | Firefox 10:30 +24h | 修复 |
| 风险时间展示 | 只有 horizon 控件和风险图 | 首屏 Risk Forecast Timeline，显示 13 个 hourly frame 的 mean/max 摘要 | Firefox snapshot/screenshot | 完成 |
| 重规划解释 | route status + pending/adopted | 增加 Departure / Risk update / Pending replan / Adoption milestone | Firefox 13:30/15:00 | 完成 |
| 默认演示状态 | 页面自动播放，打开后可能离开起点 | Presentation Mode、paused、10:00 departure | Firefox reload | 修复 |
| 船舶运动 | 已通过 | 保持连续运动，Play 仍由 Simulation Clock 驱动 | Firefox 350ms delta | 回归通过 |
| 多路线比较 | artifact 未提供三种 objective 候选 | 未伪造 Fastest/Low Risk/Recommended | bundle route metadata | 安全延期 |
| 单因素/环境图层 | artifact 未提供对应 arrays | 未让浏览器读取 A/raw weather | bundle schema audit | 安全延期 |

## 2. 当前真实输入与边界

本轮继续复用既有正式 artifact：

```text
/root/my_project/work_package_a/data/output/rc2-smoke/causal-replay-mvp/
sb-viewer-baseline-12h-det/
```

Viewer 输入仍为 Orchestrator 导出的 `work_package_d/viewer/bundle.json`：

- `replay.viewer-bundle.v1`；721 个 1 分钟 timeline entries；
- 13 个 hourly `presentation.risk-overlay.v1` frames；每帧 31×11=341 cells；
- risk source 仍为 `bc.risk-frame.v2`、`provenance=formal`；
- D 只消费 JSON/PNG，不读取 A/B 私有数据、不重算 risk、不重算 route；
- 没有生成新的 replay、12h twin-run、24h/144h replay 或 heavy integration。

## 3. Phase 1 Bug audit 与修复

### Bug 1 — 风险图分布异常

新增：`scripts/risk_distribution_audit.py`。

审计输出包括每个 frame 的 timestamp、L1–L5 数量/百分比、finite risk
score min/max/mean、hard-reason counts、网格行列与近似 cell size。

正式 artifact 的固定结果：

- 每帧 341 cells；`LAND=65`、`DATA_UNAVAILABLE=21`、`NONE=255`；
- `NONE` 始终为 Level 1（74.8%）；Level 2/3/4 始终为 0；
- hard cells 的保守 Level 5 为 86（25.2%），Viewer 仍以独立 hard layer
  绘制，不把它们当作普通 risk 5；
- finite score mean 随 valid time 约从 0.0560 变化到 0.0471，score 不是
  静态常量；
- B 配置声明 `c_equal_width_floor_v1`，实现为
  `min(5, floor(risk_score * 5) + 1)`；D 没有重新定义此映射。

结论：主要瓶颈/根因属于 B 的 demo target-grid 与当前未校准规则模型输出，
不是 D 的颜色阈值、坐标变换或 canvas 绘制错误。短期 Demo 采用解释性
Risk Forecast Timeline；不在 D 中制造 L2–L4，也不改变 risk formula。

### Bug 2 — unavailable Risk Horizon

已修复展示层：当 selection 为 `UNAVAILABLE` 时：

- 风险状态显示 `Risk Forecast unavailable`；
- 显示正式 forecast window：`2026-08-15T10:00:00Z – 2026-08-15T22:00:00Z`；
- canvas 不绘制 stale frame；
- Current/+6h 的已有 selection 不受影响。

Firefox 验证：10:30 选择 +24h 时 `risk=null`、`frame_index=null`、
`availability=UNAVAILABLE`；切回 +6h 后保持相同 simulation clock 与船位，
使用 16:00 frame、actual horizon +5h30m。

### Bug 3 — 船舶运动语义

没有发现回归，也没有修改物理语义。Firefox 观察：

```text
10:00  lat=70.3333333
10:30  lat=70.4135433
11:00  lat=70.4937532
```

Play 实际运行约 350ms：纬度变化 `0.0009796°`。位置仍来自 timeline/ETA
与 Simulation Clock；pixel speed = NO；trail、wake 仅是 presentation layer。

### Bug 4 — Route Transition

状态和时序均正确：

```text
13:30  active=1, pending=2
       New route pending · current route remains authoritative

15:00  active=2, pending=3
       New route adopted · authoritative route updated
```

15:00 同 tick 的 adoption 与下一次 decision 保持真实 event ordering；
pending fade、adoption pulse 只改变视觉 alpha/强调，不改变 route、ETA、
revision 或 completed track。

## 4. 本轮已实现的展示增强

### Risk Forecast Timeline

Orchestrator export 增加 backward-compatible presentation metadata：

- risk grid rows/cols/resolution；
- per-frame risk level counts/percentages；
- finite score min/max/mean；
- hard-reason counts。

D 只显示这些已导出的摘要，首屏用 mean/max bars 表示 formal hourly risk
profile，并用 Simulation Clock 标记当前 frame、horizon control 标记所选
frame。没有浏览器端 B 计算。

### Replay Milestones

Presentation Mode 现在显示：

```text
Departure · initial route
Risk assessment updated
Replanning triggered · new route pending
New route adopted · vessel continues
```

milestone 只随 simulation time 改变 active/past 视觉状态，不创建独立 timer。

### Presentation 默认状态

页面默认：

- Presentation Mode；
- paused at replay departure；
- Current horizon；
- Risk / Hard / Routes / Track layers 开启；
- Engineering Debug 仍可按按钮打开。

## 5. 本轮未实现与原因

### Fastest / Low Risk / Recommended 三路线

没有实现为三种 objective。当前 bundle 的五条 route 是同一个
`objective=recommended` 下的 revision 1–5，只有 distance/waypoints 等
route revision 几何；snapshot planning metadata 虽然保留了 fastest、low_risk、
recommended 的 semantic digests，但没有对应的候选 waypoints 与
average/max risk 指标。将 revision 1–3 改名为三种目标会制造业务语义，因此
安全延期到 Orchestrator 能导出真实候选集合之后。

### 单因素风险与环境数据图层

当前 presentation artifact 没有 Sea Ice/Wind/Wave/Current 因子 arrays，
也没有 A 环境 overlay 的 presentation contract。D 不读取 raw A 数据；本轮
没有伪造这些图层，也没有让浏览器重新计算 contributor。

### 点击区域 Risk Explanation Panel

同样因缺少已导出的 contributor 数据未实现。现有 risk/hard layer 的独立
语义与统计解释已保留在图例、Risk Timeline 和审计报告中。

## 6. 修改文件

### D

- `viewer/app.js`：风险时间线/摘要、unavailable 文案、milestone 状态、
  默认暂停与 horizon control reset；
- `viewer/index.html`：Risk Forecast Timeline、Replay Milestones、Play 默认文案；
- `viewer/style.css`：时间线、unavailable、milestone presentation 样式；
- `scripts/risk_distribution_audit.py`：只读风险分布审计工具；
- `RISK_DISTRIBUTION_AUDIT.md`：正式 artifact 审计报告；
- `tests/unit/test_risk_distribution_audit.py`：审计工具测试；
- `tests/unit/test_replay_viewer_bundle.py`：风险摘要/grid metadata 回归断言；
- `DEMO_REHEARSAL.md`、`README.md`、`HANDOFF.md`、`CHANGELOG.md`：同步演示操作和当前边界。

### Orchestrator

- `scripts/replay_viewer_export.py`：增加 presentation-only risk grid/frame summary；
- `tests/unit/test_replay_viewer_export.py`：新增 summary contract 测试；
- `README.md`、`CHANGELOG.md`：记录 export extension。

### 未修改

```text
work_package_a   NOT MODIFIED
work_package_b   NOT MODIFIED
work_package_c   NOT MODIFIED
arctic_route_contracts  NOT MODIFIED
```

authoritative risk formula、route result、ETA、ship position、replanning
event semantics、causal replay 和 frozen artifact 均未修改。

## 7. 测试与验证

| 检查 | 结果 | 等级 |
|---|---:|---|
| D full pytest | 57 passed | `UNIT_PASS` |
| D Ruff | clean | `UNIT_PASS` |
| `node --check viewer/app.js` | pass | `SMOKE_PASS` |
| Orchestrator focused export tests | 6 passed | `UNIT_PASS` |
| Orchestrator export Ruff | clean | `SMOKE_PASS` |
| Existing artifact export | preflight PASS / L2 PASS / timeline 721 | `REAL_ARTIFACT_HTTP_SMOKE_PASS` |
| Firefox Browser E2E | pass | `BROWSER_E2E_PASS` |
| 12h authoritative determinism | inherited, not rerun | `AUTHORITATIVE_PASS` / `FROZEN_BASELINE` |
| heavy integration/replay | not rerun; no semantic trigger | `NOT_IMPLEMENTED` for this round |

## 8. Firefox Browser E2E

Browser/tool：Firefox，Playwright CLI，D static server，
`http://127.0.0.1:8131/index.html`。

已验证：

- 页面加载、GEBCO basemap、risk/hard overlay、route、completed track、ship
  icon、Risk Timeline、Presentation Mode 均可见；
- 默认 `body[data-mode]=presentation`、debug hidden、gate badges hidden、
  clock=`10:00`、button=`Play`；
- Current / +6h / +12h / +24h 控件可选择；+24h unavailable 显式 fail-closed；
- horizon 切换不改变 simulation time、vessel lat 或物理船速；
- Play/Pause 实际点击通过，船位连续变化；1x/2x/4x/8x 四个 speed option
  实际操作；
- 10:00/10:30/11:00 连续移动；13:30 pending；15:00 adopted；
- Risk layer toggle、Engineering Debug toggle 实际操作；
- console errors=0、warnings=0；静态 `index.html/style.css/app.js/bundle.json/
  favicon.svg/gebco_basemap.png` 全部 HTTP 200。

Proof：

- [10:00 Current + Risk Timeline](../.runtime/viewer-proof/competition-current-10-00-timeline.png)
- [10:30 Current](../.runtime/viewer-proof/competition-current-10-30.png)
- [13:30 pending](../.runtime/viewer-proof/competition-pending-13-30.png)
- [15:00 adopted](../.runtime/viewer-proof/competition-adopted-15-00.png)
- [10:30 +24h unavailable](../.runtime/viewer-proof/competition-unavailable-plus24-10-30.png)

## 9. 性能与耗时分析

以下是 WSL 本地工程观察，不是专业 benchmark；未同时运行大型任务。

### Viewer/browser

Firefox warm local load observation：

| 指标 | 结果 |
|---|---:|
| DOMContentLoaded | 约 28 ms |
| load event | 约 29 ms |
| `bundle.json` encoded body | 1,440,817 B |
| `app.js` encoded body | 33,602 B |
| `style.css` encoded body | 6,959 B |
| GEBCO PNG encoded body | 13,938 B |
| risk frames/cells | 13 / 341 |
| risk horizon switch | 无可见 freeze；同一 clock/ship state |

本轮 bundle 增长来自 per-frame summary metadata；浏览器不遍历 raw weather
grid，不重新计算 B。Risk Timeline 只消费导出的 summary；页面没有发现
multi-second render freeze。

### 本轮命令耗时

- presentation export 使用既有 manifest/snapshots，命令 wall time 约 1.3s；
- D full pytest：约 1.60s；
- Orchestrator focused export tests：约 0.36s；
- 审计工具生成 13-frame report：约 0.5s；
- 本轮没有启动 heavy replay、12h twin-run 或 full integration。

### 历史权威耗时，单独列出

这些不是本轮重跑结果：

- latest-head authoritative 12h replay/determinism baseline：约 2044.9s，
  约 34.1min，`INHERITED`；
- previous full integration suite：约 2495.25s，约 41:35；
- recent product-round integration suite：约 2334.71s，约 38:54，
  `INHERITED`。

不能把上述 replay/integration wall time 与 Viewer load time 合并成一个
性能数字。

## 10. Git / frozen boundary

本轮只进行了只读 Git 状态核对，没有 commit、reset、rebase、merge 或 push。
本轮 start HEAD = end HEAD；没有产生本轮 commit。

| 仓库 | branch | HEAD | ahead/behind upstream | dirty / 本轮状态 |
|---|---|---|---|---|
| root `/root/my_project` | `demo-engineering` | `3812b5d` | `0/0` | 仅预期 nested D entry；root `.git` untouched |
| governance | `demo-engineering` | `234573d` | `0/0` | clean；未修改 |
| contracts | `demo-engineering` | `7e83182` | `0/0` | clean；未修改 |
| orchestrator | `demo-engineering` | `b833206` | `0/0` | dirty：export、focused test、README/CHANGELOG |
| A | `demo-engineering` | `c6d0718` | `0/0` | clean；未修改 |
| B | `demo-engineering` | `6269420` | `0/0` | clean；未修改 |
| C | `demo-engineering` | `42e951c` | `0/0` | clean；未修改 |
| D | `demo-engineering` | `b437efa` | `2/0` | dirty：Viewer、audit、tests、docs/report |

```text
PUSH = NOT PERFORMED
```

最终 branch/HEAD/dirty/ahead-behind 以报告生成时的 `git status -sb` 矩阵为准；
本轮预期 dirty 仅来自上述 D/Orchestrator 工作文件与 D 本地忽略 artifact，
未触碰任何 frozen package。

## 11. 阶段结论与 NEXT

当前单路线 deterministic artifact 的 Competition Demo Presentation Polish
已完成，Bug 1–4 均有机器/浏览器证据，且 authoritative semantics 没有回退。

```text
DEMO_PRESENTATION_POLISH = PASS
DEMO_FREEZE_CANDIDATE = YES
```

这表示当前真实 artifact 可进入人工演示彩排/冻结评审，不表示缺失的多目标
路线候选、单因素环境 arrays 已被实现。下一步只有在有真实 presentation
contract/artifact 后再接入：

1. Fastest / Low Risk / Recommended candidate set 与指标；
2. Sea Ice / Wind / Wave / Current factor/environment layers；
3. contributor-backed Risk Explanation Panel。

在这些输入出现前，保持当前 Viewer 的 fail-closed、D-only presentation
boundary，不改 B/C 算法和 authoritative semantics。
