# 维优猎头 BD 雷达 Phase 5 交接报告

日期：2026-09-03  
分支：`feat/headhunter-finance-mvp-phase5`  
最新提交：`36b8cad`

## 当前结论

代码实施、静态检查、HeadHunter 金丝雀验收和既有 v1.5/v1.6 回归均通过；V1.2 正式 Weekly Pipeline 已完成部署，并以同一最终版本重建了 W36/W37 两个连续周的真实快照。Finance 分支已通过 SWAS 部署，DNS/TLS、健康检查和只读生产 smoke 已通过；当前启用 `FINANCE_PUBLIC_MODE=true`，公开 GET 数据，写操作仍受保护。生产默认 routing 未修改，等待业务人工审核后再决定采用。

## Gate 状态

| Gate | 状态 | 证据 |
|---|---|---|
| Task 1–20 代码实施 | PASS | `git log`：domain model 至 live E2E 提交链 |
| HeadHunter golden acceptance | PASS | `npm run verify:headhunter`，含 8 gates + ranking/archive/markdown invariants |
| Scheduler wiring | PASS | 周一 07:00 Asia/Shanghai；执行测试验证 run、lead、snapshot 持久化及发布 |
| Deployment artifact wiring | PASS | ECS/Workbench Nginx、HTTPS helper、Finance secrets template、scheduler enablement；`verify:q7:aliyun-runbook` 99/99 |
| SSH / Workbench access | PASS | TRAE rescue report: invalid `Port 222222` entries and missing `/run/sshd` repaired; `sshd -t` + TCP 22 listener verified |
| Existing regression | PASS | `typecheck`、`verify:v15:e2e`、`verify:v15`、`verify:v16` |
| Search provider benchmark script | NOT THE V1.2 gate | V1.2 Weekly Pipeline 已使用当前可用 Serper；独立 TikHub/Search Jobs 大规模 benchmark 维持 HOLD |
| TikHub benchmark script | NOT PRESENT | `verify:tikhub-benchmark` 不在当前 HEAD |
| Real Golden Weekly | PASS (pipeline/data gates) | W36/W37 各 115 candidate URLs、25 candidates、20 resolved companies、31 signals、48 jobs、49 people/contact entries；A=2/B=18；人工全量 precision/judgment 尚未完成 |
| Production DNS/TLS/smoke | PASS (read-only) | `finance.chanceping.com` → `8.218.11.71`；Let's Encrypt SAN 包含 Finance；`/login` 200、`/` 302、公开 weekly API 200 |
| Production routing adoption | NOT APPROVED | 需业务审核及真实信号质量证据 |

## Real E2E evidence

Run ID：`headhunter-golden-2026-W37`
Artifact：`data/headhunter/live-runs/headhunter-live-2026-09-02T13-52-19-060Z-7ab0658a.json`

- Serper：99 requests / 99 successes / 0 failures / cost unknown（重复运行主要命中缓存）
- Doubao：本地 `api.env` 有 Key，但生产 `/etc/chanceping/chanceping.env` 尚未配置，因此未进入本次生产 run
- 每周：115 candidate URLs / 25 candidates / 20 verified companies / 31 signals / 48 jobs / 49 people / 49 contacts / 58 needs / A=2 / B=18
- W36 与 W37 均 `published=true`，由同一个正式 Weekly Snapshot 生成链路发布

## FACT / IMPACT / OPTIONS / RECOMMENDATION / COST-RISK

### FACT

HeadHunter Finance UI、受保护 API、管理员会话、人工 B 池写入、证据 override、周报 Markdown、成本 unknown 标记、Company Profile 缓存、搜索路由和周一调度代码均已落地。调度任务现在会从规范化 stores 运行完整评分流水线，并在成功时原子发布周快照；失败不会覆盖旧正式快照。

### IMPACT

`finance.chanceping.com` 已上线为公开只读 Finance MVP；真实搜索结果仍不能视为已验证的公司级 BD 线索，生产默认 routing 仍未修改。管理员模式可在后续配置 Finance auth secrets 后恢复。Doubao/Serper 的价格仍需在实际账户或控制台确认，unknown 不按 0 元计算。

### OPTIONS

1. 先补齐 DNS、TLS、生产 secrets 和现有 Aliyun/Nginx 主机访问，再执行只读生产烟测及安全的手动 B/重启/清理验收。
2. 先离线补齐缺失的 Search/TikHub benchmark verifier，再进行业务质量审核；不改变当前生产路由。
3. 在没有真实部署凭证时，仅继续本地数据和 provider 质量分析，不做远程发布。

### RECOMMENDATION

采用选项 1 + 2：先让运维提供现有主机、DNS/TLS 和 Finance secrets 的部署窗口；同时由业务方审核 live raw evidence，并补齐 benchmark verifier 或确认其历史证据位置。完成远程 smoke、手动 B 重启持久化和一次失败运行不覆盖快照的证据后，才进入生产路由评审；在此之前保持 `LOCKED`。

### COST-RISK

- 本轮新增代码不触发外部 provider 大规模调用；live E2E 已产生的 provider 成本以原始 artifact 为准，当前报告中的 cost 字段保持 unknown。
- Scheduler 不会静默调用付费 provider；它消费已规范化数据。显式 live benchmark 才会调用搜索 provider。
- 最大剩余风险是远程部署状态未知、DNS/TLS 未配置，以及搜索结果尚未通过人工 precision/identity 审核；因此禁止自动合并 `main` 或修改生产默认 routing。

## 交接文件

- `docs/phase5/DATA_MODEL.md`
- `docs/phase5/API_CONTRACT.md`
- `docs/phase5/GOLDEN_ACCEPTANCE.md`
- `docs/phase5/DEPLOYMENT.md`
- `data/headhunter/live-runs/headhunter-live-2026-09-02T13-52-19-060Z-7ab0658a.json`
- `docs/phase5/V1.2_LIVE_GOLDEN_REPORT_2026-09-03.md`
- `artifacts/aliyun-workbench/chanceping-workbench-20260902-140806.tar.gz`（6.39 MB，已通过敏感文件排除检查）
- `artifacts/aliyun-workbench/chanceping-workbench-20260902-140806.tar.gz.json`
- `/tmp/chanceping-phase5-regression.log`（本机临时回归日志）
