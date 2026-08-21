# REPLAY_48H_EXTENSION_REPORT

> 日期：2026-08-21  
> 阶段：Competition Demo / 48h replay extension  
> 实现 commit：`08844fa` (`feat: extend viewer route evolution to 48h replay`)

## 1. 结论

```text
DEMO_48H_READY = YES
```

结论适用于当前本地生成的真实 causal replay artifact 和 Firefox Demo
启动方式。没有通过前端循环复制 12h 数据，也没有改变 A/B/C 的业务语义。
未执行 push 或任何 remote 操作。

本轮的实现范围只有 D Viewer 的长 replay 展示适配和对应测试：

- Viewer 的 Route evolution timeline 现在展示 bundle 中所有真实的
  `REPLAN_DECIDED` / `REPLAN_ADOPTED` 事件，而不是只展示首个事件。
- D 测试从固定 12h 数量改为按 replay start/end/cadence 验证，兼容真实
  48h bundle。
- 生成了新的 `sb-viewer-baseline-48h` causal replay，并用现有
  Orchestrator Presentation Adapter 导出 Viewer bundle。

## 2. 冻结边界

没有修改：

- `work_package_a`
- `work_package_b`
- `work_package_c`
- `arctic_route_contracts`
- Orchestrator 的生产源代码
- risk formula、risk level policy、ETA、route cost、ship motion、replanning
  event semantics

Orchestrator 仍只负责 export；D 仍是唯一 Viewer runtime owner。浏览器继续
只消费 `replay.viewer-bundle.v1`，没有在浏览器端重算 risk、route 或 replay
时间。

## 3. 新 artifact

生成命令使用了已有数据和现有 causal replay runner：

```bash
cd /root/my_project/arctic_route_orchestrator
.venv/bin/python scripts/causal_replay_mvp.py \
  --replay-id sb-viewer-baseline-48h \
  --replay-start 2026-08-15T10:00:00Z \
  --window-hours 48 \
  --risk-forecast-end 2026-08-18T15:00:00Z \
  --planning-workers 3 \
  --replan-min-interval-hours 2 \
  --parallel-pool-mode percall
```

### Causal replay artifact

路径：

```text
/root/my_project/work_package_a/data/output/rc2-smoke/causal-replay-mvp/sb-viewer-baseline-48h/
```

| 项目 | 结果 |
|---|---:|
| replay id | `sb-viewer-baseline-48h` |
| scenario mode | `causal_replay` |
| start | `2026-08-15T10:00:00Z` |
| end | `2026-08-17T10:00:00Z` |
| replay window | 48h |
| snapshot cadence | 1h |
| snapshots | 49 |
| manifest semantic digest | `b22fdb183c4d4ade022d253c890f5f35d4d03f5f26dce46c47570f8c6eb920c2` |
| manifest SHA-256 | `ac7db496b965adff6971d1de0f7b2828fb8e57b478690d7b0a82d7fc24f3622c` |
| preflight / replay validation | PASS |

该 artifact 是 runner 从真实 snapshot、正式 risk store 和实际 C 规划结果
生成的 48h 回放，不是把 12h snapshot 人工重复四次。

### Viewer bundle

导出路径：

```text
/root/my_project/work_package_d/viewer/bundle.json
```

| 项目 | 12h baseline | 48h result |
|---|---:|---:|
| schema | `replay.viewer-bundle.v1` | `replay.viewer-bundle.v1` |
| timeline | 721 one-minute samples | 2,881 one-minute samples |
| in-window risk frames | 13 | 49 |
| risk grid | 31 × 11 = 341 exact cells | 31 × 11 = 341 exact cells |
| route revisions exported | baseline route set | R1–R19 |
| bundle size | 1,435,891 bytes | 6,167,478 bytes |

当前 48h bundle SHA-256：

```text
7a9111ee918e09f53131c9a2790771775c6272202d4b9190cf407acdb6460691
```

正式 risk source 仍为 `bc.risk-frame.v2`，presentation risk schema 仍为
`presentation.risk-overlay.v1`。原始 formal risk store 在 replay 之外继续
提供到 `2026-08-18T15:00:00Z` 的 frame；Viewer bundle 只投影 replay window
内的 49 个 frame，避免把 replay 外的未来内容误当成当前回放状态。

## 4. Timeline、船舶和 Simulation Clock

- Timeline 从 `2026-08-15T10:00:00Z` 连续覆盖到
  `2026-08-17T10:00:00Z`，每分钟一个 presentation sample。
- snapshot cadence 和 render cadence 继续分离：snapshot 为 1h，vessel
  position 由 backend ETA/route edge 与唯一 Simulation Clock 得到。
- replay 末端 vessel 仍为 `UNDERWAY`，position 为约
  `lon=12.4796433, lat=77.6423312`，edge progress 约 `0.9336`。
- Firefox Play 真实观测中，船位从约
  `lat=70.3430479, lon=18.4` 变为
  `lat=70.3454543, lon=18.4`；不是 CSS 无限动画或固定 pixel speed。
- scrub 到 `2026-08-15T11:00:00Z` 后，Simulation Clock、船、risk 和 route
  状态同步更新。

## 5. Risk window 和 fail-closed

48h bundle 导出了每个 one-minute simulation sample 的 horizon selection
索引（2,881 条），并保持原有选择规则：

```text
requested_valid_time = simulation_time + requested_horizon
actual frame = formal valid_time selected by the export contract
out of range = UNAVAILABLE
```

Firefox 验证结果：

- departure `10:00` 选择 `+24h`：显示精确的
  `2026-08-16T10:00:00Z` frame。
- replay end `2026-08-17T10:00` 选择 `+24h`：显示
  `Risk Forecast unavailable`，并明确显示 available window、requested
  valid time 和 `requested_valid_time_after_available_range`。
- unavailable 时 basemap、ship、route 仍保持显示；没有 fallback 到 Current，
  没有复用旧 frame，也没有把 unknown 显示成低风险。

## 6. Route evolution 和 event ordering

真实 manifest event counts：

| Event | Count |
|---|---:|
| `CLOCK_TICK` | 49 |
| `PLAN_REUSED` | 28 |
| `REPLAN_DECIDED` | 19 |
| `REPLAN_ADOPTED` | 18 |
| `ROUTE_CHANGED` | 18 |
| `B_REUSED` | 48 |
| `RISK_WINDOW_ADVANCED` | 48 |

Viewer bundle 中保持单 authoritative route 和真实 route revisions；没有
`route_candidates`，因此没有伪造 Fastest/Low Risk/Recommended。

本轮 D 的展示改为逐条消费真实 route events：

- `REPLAN_DECIDED` 显示为 `R# pending`，active route 仍保持 authoritative。
- `REPLAN_ADOPTED` 显示为 `R# adopted`，authoritative route 才切换。
- `ROUTE_CHANGED` 不再作为重复 timeline item。
- 48h 中导出的 route payload 为 R1–R19；replay 末端状态为 active R19、
  pending R20。
- 同 tick ordering 保留，例如 `2026-08-15T15:00:00Z` 先显示
  `REPLAN_ADOPTED R2`，随后显示 `REPLAN_DECIDED R3`。

## 7. Firefox Browser E2E

启动方式：

```bash
cd /root/my_project/work_package_d
.venv/bin/python scripts/replay_viewer_serve.py \
  --host 127.0.0.1 --port 8134
```

工具：Firefox 通过 Playwright CLI；浏览器实际启动并访问
`http://127.0.0.1:8134/index.html`。

| 检查项 | 结果 |
|---|---|
| 页面加载 / 48h range | PASS |
| 默认 Presentation Mode | PASS |
| departure paused | PASS |
| GEBCO basemap / route / ship | PASS |
| Current risk | PASS |
| `+24h` available at departure | PASS |
| `+24h` unavailable at replay end | PASS |
| Play / Pause | PASS |
| 船位真实变化 | PASS |
| scrub | PASS |
| 1x / 2x / 4x / 8x controls | PASS |
| Presentation / Engineering Debug toggle | PASS |
| 13:30 pending state | PASS，active R1 / pending R2 |
| 15:00 adoption state | PASS，active R2 / pending R3 |
| all route evolution items | PASS，37 real decision/adoption items |
| console errors / warnings | 0 / 0 |
| required static requests | 6/6 HTTP 200 |

Browser proof 已保存到：

```text
/root/my_project/.runtime/viewer-proof/replay-48h-20260821/
```

关键截图：

- `final-presentation-departure.png`
- `horizon-plus24-10-00.png`
- `pending-13-30.png`
- `adopted-15-00.png`
- `unavailable-plus24-end.png`

## 8. 测试结果

### D

```text
pytest: 58 passed in 1.33s
ruff: clean
node --check viewer/app.js: PASS
git diff --check: PASS
```

### Orchestrator

本轮没有修改 Orchestrator source；focused export regression：

```text
pytest tests/unit/test_replay_viewer_export.py: 7 passed in 0.35s
ruff: clean
```

没有重新运行 12h twin-run、full heavy integration 或 144h replay。12h
authoritative determinism twin-run 仍为既有 inherited baseline，不在本轮宣称
重新验证。

## 9. 性能和耗时分析

以下是工程观察，不是专业 benchmark；replay runner 和浏览器 load 分开统计。

### Replay 生成

| 指标 | 48h result |
|---|---:|
| total replay wall time | 2,780.1s ≈ 46m20.1s |
| planning elapsed reported by runner | 2,565.0s ≈ 42m45.0s |
| peak RSS | 824.2MB |
| parallel planner workers | 3 |
| heavy replay concurrency | 1 |

WSL 检查时总内存约 7.4GiB、available 约 5.7GiB、swap 使用为 0；没有并行
运行第二个 heavy replay，也没有发生 OOM。

### Viewer 负载

| 指标 | 观测 |
|---|---:|
| bundle decoded size | 6,167,478 bytes |
| bundle transfer size | 6,167,778 bytes |
| bundle resource duration | 118ms |
| DOMContentLoaded | 163ms |
| load event | 168ms |
| horizon UI update | 14ms |
| app.js transfer | 44,855 bytes |

这些数字来自本机 `127.0.0.1` Firefox Performance API；不代表比赛现场网络
带宽下的最终加载时间。相对 12h baseline，timeline 约扩大 4 倍，bundle 约
扩大 4.29 倍，当前本机仍无明显 UI freeze。若未来需要远程网络部署，bundle
应考虑压缩或按时间窗口 lazy-load，但本轮不改变 artifact contract。

## 10. 未解决限制

1. 48h presentation bundle 的 risk frame 投影只覆盖 replay window；在 replay
   末端请求更远 horizon 会正确 unavailable。若比赛脚本要求展示 replay 外的
   forecast，需要另行决定 export window，不应由 D 偷偷 fallback。
2. route candidates 仍为 `NOT_PUBLISHED`，本轮没有制造三条候选路线。
3. 本轮没有重新执行 12h determinism twin-run；causal replay、navigation 和
   authoritative semantics 均未改动，因此沿用 inherited authoritative baseline。
4. 48h route evolution 有 37 条 decision/adoption timeline item，工程模式下
   信息密度较高；这是 artifact 的真实事件密度，不是 UI 过滤造成的语义变化。

## 11. Git / 提交

本轮实现 commit：

```text
08844fa feat: extend viewer route evolution to 48h replay
```

该 commit 包含：

```text
tests/unit/test_replay_viewer_bundle.py
viewer/app.js
viewer/index.html
```

本报告随后作为 report-only local commit 提交；具体最终 HEAD 以报告提交后
的 `git rev-parse HEAD` 为准。没有 push、merge、reset、rebase 或 remote
branch 操作。

