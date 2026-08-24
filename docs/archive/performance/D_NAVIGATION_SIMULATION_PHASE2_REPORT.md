---
Overall Status: ACTIVE
Content Status:
  - COMPLETED
  - PLANNED
Document Role: SUPPORTING
Scope: D Navigation Decision Simulation Viewer Phase 2 engineering evidence
Canonical For: NO; supporting evidence for docs/viewer/README.md
Branch: research-validation-system
Last Verified: 2026-08-23
Related Canonical Docs:
  - ../README.md
---

# D Navigation Decision Simulation Phase 2 Report

## 1. Executive Summary（2026-08-23 18:11 +08:00）

本轮把 D 的默认 presentation 语义从媒体式 Replay Player 提升为 Navigation Decision
Simulation Viewer，同时保留内部 `presentation` mode、现有 replay、single-route fallback、
Research Validation 与 Engineering Debug。最终判定：现有 frozen 48h bundle 下 Phase 2 为
`REAL_E2E_PASS`；Winter 4×3 Research View 仍为 `UNIT_PASS`，因为 combined Winter bundle
尚未发布。无代码 blocker。

### Key Delta（2026-08-23 18:11 +08:00）

| Metric / Claim | Before | After | Verdict |
|---|---|---|---|
| 主操作 | Play | Run / Pause | IMPROVED |
| 主轴语义 | elapsed-time scrub | Voyage Progress km | IMPROVED |
| 时间显示 | relative elapsed | absolute UTC Simulation Time | PASS |
| 速度标签 | speed | Simulation Speed | PASS |
| 风险时效 | Current/+6/+12/+24 | Now/+6/+12/+24 | PASS |
| fallback | `SINGLE_ROUTE_FALLBACK` | preserved | PASS |
| Winter Research Browser E2E | NOT_IMPLEMENTED | NOT RUN | UNCHANGED |

### Claim Matrix（2026-08-23 18:11 +08:00）

| Claim | Status | Validation Level | Evidence | Limitation |
|---|---|---|---|---|
| Run/Pause 驱动唯一 Simulation Clock | PASS | REAL_E2E_PASS | Firefox | frozen Summer bundle |
| Voyage Progress 与仿真时间可逆映射 | PASS | REAL_E2E_PASS | 432.5 km scrub → 2026-08-16 10:06Z | stationary interval 会 fail closed 回时间轴 |
| 船位仍来自 timeline/ETA | PASS | REAL_E2E_PASS | 10:30 lat 70.413543 | 未重跑 backend |
| route/risk/ETA 未重算 | PASS | UNIT_PASS | code audit + 78 tests | D 仅计算展示型累计航程 |
| Research 4×3 comparison preserved | PASS | UNIT_PASS | real sidecar fixture | combined Winter browser artifact 缺失 |
| DATA_UNAVAILABLE != SAFE | PASS | REAL_E2E_PASS | +24h unavailable、hard overlay | — |

## 2. Scope / Non-Scope（2026-08-23 18:11 +08:00）

Scope：仅修改 `work_package_d/viewer/` 的 HTML/CSS/JS 与本报告；完成 Run、公里航程轴、
Simulation Time、Simulation Speed、Navigation Decision 文案及 Research strategy 显示。

Non-scope：未修改 A/B/C、Orchestrator、shared contracts、artifact、risk、ETA、ranking、
route geometry、ship physics；未生成候选路线，未运行 replay/B/C/heavy integration。

## 3. Starting Baseline（2026-08-23 18:11 +08:00）

- D start HEAD：`cf87934937e004f290df212c12fda549c5d125e3`。
- artifact：`viewer/bundle.json`，48h frozen Summer replay，`route_candidates=NOT_PUBLISHED`。
- Phase 1：4 layers × 3 objectives strict intake 已 `UNIT_PASS`；frozen fallback 已
  `REAL_E2E_PASS`。
- 已知限制：无同一 Winter identity 的 risk/replay/candidate combined bundle。

## 4. Git Final State（2026-08-23 18:11 +08:00）

| Repo | Branch | Start HEAD | End HEAD | Tracking | Ahead/Behind | Tree | Push |
|---|---|---|---|---|---|---|---|
| work_package_d | research-validation-system | `cf87934` | 本报告所在本地 commit | origin/research-validation-system | final response 记录 | commit 后 clean | NO |

其他仓库未修改。提交标题为 `feat: enhance navigation decision simulation viewer`；该提交的
最终 hash 由 commit 后 `git log -1` 记录，避免在提交内容内建立自引用 hash。

## 5. Filesystem & Resource Safety（2026-08-23 18:11 +08:00）

- 主动写入：仅 `${ARCTIC_ROUTE_ROOT}/**`。
- 初始/最低/最终 `MemAvailable`：约 6.0 / 3.4 / 5.9 GiB；最低值期间存在用户的
  VS Code extension host（约 1.4 GiB RSS），本轮未干预该进程。
- Swap used：初始与最终均约 3.7 MiB；pytest swaps=0。
- pytest peak RSS：70,512 KiB；低于 2 GiB 约束。
- OOM：0；heavy-task overlap：N/A。
- `/` 为 WSL VHD 逻辑空间；Windows 宿主物理剩余空间未核验，状态为 `UNKNOWN`。

## 6. Code / Architecture Changes（2026-08-23 18:11 +08:00）

| Component | Old | New | Reason |
|---|---|---|---|
| Simulation controls | Play + relative clock | Run/Pause + absolute UTC | 表达航行决策仿真 |
| Slider | time milliseconds | published vessel-track cumulative km | 表达 voyage execution progress |
| Progress mapping | N/A | km↔simulation time monotonic index | 不改变唯一主时钟 |
| Research panel | Research validation | Navigation Decision + Current Strategy | 明确风险-时间权衡 |
| Mode badge | causal_replay everywhere | navigation_simulation；Debug 显示真实 scenario mode | presentation/debug 分层 |
| Risk horizon | Current | Now | 面向 forecast horizon |

## 7. Semantic / Contract Changes（2026-08-23 18:11 +08:00）

Shared/business contract change：`NONE`。`simulation_time` 仍是唯一业务主状态；公里轴由
published timeline position 预计算，只是 display coordinate。D 不计算 risk、ETA、route
distance、ranking 或 candidate。`selected_candidate_id`、geometry、metrics、active/pending
revision 均保持 artifact 原值。`DATA_UNAVAILABLE`、LAND 与 risk level 继续分层并 fail closed。

## 8. Experiments / Alternatives（2026-08-23 18:11 +08:00）

| Alternative | Decision | Reason |
|---|---|---|
| 仅把 time slider 改名为 progress | 未采用 | 轴位置仍是时间，语义不一致 |
| 用 route distance × elapsed fraction | 拒绝 | 会伪造物理航程 |
| 从 published vessel timeline 累计航程 | 采用 | 与真实 vessel position 同源 |
| stationary interval 强行压缩 | 拒绝 | 会跳过 simulation states；改为时间轴 fallback |
| 新增第四个 viewMode | 未采用 | 保持现有 API/CSS/fallback 兼容 |

## 9. Authoritative Run / Real Validation（2026-08-23 18:11 +08:00）

Backend authoritative run：`NOT RUN`，本轮只修改 D rendering。

Firefox + Playwright CLI 验证现有 frozen 48h bundle：页面加载、Run/Pause、8x、公里 scrub、
Now/+6/+24 unavailable、Navigation/Engineering 切换均通过。10:30 船位为 lon 18.4、lat
70.413543；13:30 active=1/pending=2；15:00 active=2/pending=3，保留同 tick ordering。
console errors/warnings=0，7 个 required static requests 均 HTTP 200。

## 10. Performance Breakdown（2026-08-23 18:11 +08:00）

| Metric | Before | After | Delta | Verdict |
|---|---:|---:|---:|---|
| HTML/CSS/JS/validator | 87,131 B | 94,631 B | +7,500 B / +8.6% | EXPECTED |
| including 6.17 MB bundle | 6,254,609 B | 6,262,109 B | +0.12% | PASS |
| pytest wall | 1.65 s prior | 1.76 s pytest / 1.90 s timed process | small observation | PASS |
| pytest peak RSS | 70,804 KiB prior | 70,512 KiB | -292 KiB | PASS |

Voyage index 对 2,881 timeline points 执行一次 O(n) 初始化；每次 frame/scrub 使用 binary
search O(log n)，未引入 dependency、raw grid 处理或持续后台计算。浏览器进程族的聚合 peak
RSS 未采样，因此不把浏览器内存写成专业 benchmark；交互中未观察到冻结或多秒响应。

## 11. Correctness / Validation（2026-08-23 18:11 +08:00）

| Check | Result |
|---|---|
| D full pytest | 78 passed |
| Ruff | PASS |
| `node --check viewer/app.js` | PASS |
| `node --check viewer/research_candidates.js` | PASS |
| `git diff --check` | PASS |
| focused navigation/candidate/bundle tests | 31 passed |
| Firefox console/network | 0 errors/warnings；7/7 HTTP 200 |
| single-route fallback | PASS |
| +24h no stale-frame fallback | PASS |
| Research real sidecar intake | UNIT_PASS / inherited from Phase 1 |
| Winter combined Browser E2E | NOT RUN |

## 12. Determinism / Reproducibility（2026-08-23 18:11 +08:00）

状态：`INHERITED / NOT RUN`。未修改 replay、risk、planner 或 artifact digest。Voyage index
只依赖确定的 timeline coordinates/timestamps；相同 bundle 产生相同累计距离和逆映射。
Browser RAF wall time 只推进 simulation clock，不写入 artifact。

## 13. Artifacts / Provenance（2026-08-23 18:11 +08:00）

| Artifact | Path | Provenance / Tracking |
|---|---|---|
| frozen Viewer bundle | `viewer/bundle.json` | Orchestrator export；gitignored；未修改 |
| Phase 2 screenshot | `.runtime/viewer-proof/d-phase2/.playwright-cli/page-2026-08-23T10-12-21-870Z.png` | Firefox CLI；untracked |
| self-contained Viewer | `.runtime/viewer-proof/d-phase2/index_self_contained.html` | D embed；6,280,722 B；untracked |
| Phase 2 report | `D_NAVIGATION_SIMULATION_PHASE2_REPORT.md` | tracked Supporting doc |

## 14. Known Limitations / Technical Debt（2026-08-23 18:11 +08:00）

| ID | Severity | Limitation | Next action |
|---|---|---|---|
| D-P2-01 | HIGH | Winter combined Viewer bundle 尚未发布 | Orchestrator assembly 后执行 Research Browser E2E |
| D-P2-02 | MEDIUM | stationary timeline 不能用纯距离轴唯一表示 | 当前 fail closed 回时间轴；未来可加 dual-axis proposal |
| D-P2-03 | LOW | 865.2 km 是 48h simulation window，不是 909.7 km 完整初始 route | UI 已并列标注，不做 extrapolation |
| D-P2-04 | LOW | 未做专业 FPS/load benchmark | 部署硬件确定后测量 |

Unexpected finding：当前 48h window 在船到达前结束，因此 cumulative simulated track 与完整
initial route distance 不同。新 UI 明确区分二者，没有把剩余航程伪装为已执行。

## 15. Decision / Next Phase（2026-08-23 18:11 +08:00）

```text
D_NAVIGATION_SIMULATION_PHASE2 = REAL_E2E_PASS (existing frozen fallback)
RESEARCH_ROUTE_COMPARISON = UNIT_PASS
WINTER_RESEARCH_BROWSER_E2E = NOT_IMPLEMENTED
```

下一阶段应由 Orchestrator 组装同一 Winter identity 的 risk/replay/candidate combined bundle，
然后执行 Firefox Research E2E。不要修改 B risk、C planner、shared contracts，或把 Summer
replay 与 Winter candidates 混装来提高展示成熟度。
