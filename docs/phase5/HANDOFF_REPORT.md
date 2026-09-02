# 维优猎头 BD 雷达 Phase 5 交接报告

日期：2026-09-02  
分支：`feat/headhunter-finance-mvp-phase5`  
最新提交：`d6e7218`

## 当前结论

代码实施、静态检查、HeadHunter 金丝雀验收和既有 v1.5/v1.6 回归均通过；真实搜索 E2E 已跑通，但结果仍是 B 池 enrichment，尚未达到生产采用门槛。`finance.chanceping.com` 的 DNS/TLS/远程烟测未通过，因此生产状态保持 `LOCKED`，没有修改生产默认路由、DNS 或云端部署。

## Gate 状态

| Gate | 状态 | 证据 |
|---|---|---|
| Task 1–20 代码实施 | PASS | `git log`：domain model 至 live E2E 提交链 |
| HeadHunter golden acceptance | PASS | `npm run verify:headhunter`，含 8 gates + ranking/archive/markdown invariants |
| Scheduler wiring | PASS | 周一 07:00 Asia/Shanghai；执行测试验证 run、lead、snapshot 持久化及发布 |
| Existing regression | PASS | `typecheck`、`verify:v15:e2e`、`verify:v15`、`verify:v16` |
| Search provider benchmark script | NOT PRESENT / INCOMPLETE | package script 仍引用不存在的 `scripts/verify-*-search-provider.ts` |
| TikHub benchmark script | NOT PRESENT | `verify:tikhub-benchmark` 不在当前 HEAD |
| Real E2E | PARTIAL PASS | Serper 有结果；Doubao 请求成功但返回 0 条；全部候选进 B 池 |
| Production DNS/TLS/smoke | BLOCKED | `finance.chanceping.com` 无法解析，远程 fetch 失败 |
| Production routing adoption | NOT APPROVED | 需业务审核及真实信号质量证据 |

## Real E2E evidence

Run ID：`headhunter-live-2026-09-02T13-52-19-060Z-7ab0658a`  
Artifact：`data/headhunter/live-runs/headhunter-live-2026-09-02T13-52-19-060Z-7ab0658a.json`

- Serper：3 requests / 15 results / 0 failures / cost unknown
- `doubao_search`：2 requests / 0 results / 0 failures / cost unknown
- 候选公司：15；A 池：0；B 池：15；趋势：0
- Weekly snapshot 在 live benchmark 中保持 `published=false`，没有被误发布

## FACT / IMPACT / OPTIONS / RECOMMENDATION / COST-RISK

### FACT

HeadHunter Finance UI、受保护 API、管理员会话、人工 B 池写入、证据 override、周报 Markdown、成本 unknown 标记、Company Profile 缓存、搜索路由和周一调度代码均已落地。调度任务现在会从规范化 stores 运行完整评分流水线，并在成功时原子发布周快照；失败不会覆盖旧正式快照。

### IMPACT

当前可以在本地或已配置部署主机上进行受保护的 Finance MVP 验收，但不能宣称 `finance.chanceping.com` 已上线，也不能把 live E2E 的 15 条搜索结果视为已验证的公司级 BD 线索。Doubao/Serper 的价格仍需在实际账户或控制台确认，unknown 不按 0 元计算。

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
- `/tmp/chanceping-phase5-regression.log`（本机临时回归日志）

