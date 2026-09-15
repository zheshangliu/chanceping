# 盯非遗｜采购机会工作台 V1.0 最终交付

生成时间：2026-09-15（Asia/Shanghai）
交付分支：`codex/procurement-workbench-v1-business`
生产业务基线：`release-procurement-phase1-2b-20260913-f514ee6` / `f514ee6b624dc2bb5abf12bb317cb30c37bedb5d`
控制面：`b3fcda3cdd5113ba7388dfd37c5cdc853eda8b0f`

## 一、Jason 现在能用什么

已上线入口（M0）：

- [盯非遗首页](https://ich.chanceping.com/ich)
- [采购雷达 API](https://ich.chanceping.com/api/opportunity-v2/radar)
- [采购来源 API](https://ich.chanceping.com/api/opportunity-v2/sources)

生产当前证据为 `PRODUCTION_EXECUTED`：release `20260915T041344Z-f514ee6b624d`，最近一次受控抓取时间约为 2026-09-15 12:16（北京时间），两轮结果均为 38 个来源、2533 条池内记录、3 条公开采购。

M1 工作台入口已在本分支实现，尚未部署：

- `/ich/procurement`
- `/api/opportunity-v2/workbench`
- `/api/opportunity-v2/workbench/export?format=markdown`

使用方式：打开采购工作台 → 按“当前采购 / 提前跟进 / 历史研究”筛选 → 打开官方公告核验资格与附件 → 已授权业务用户通过 followups API 保存私有跟进；导出不包含私有备注。

## 二、交付状态

总状态：`SHIPPED_WITH_BACKLOG`

| 里程碑 | 实际状态 | 证据 | 未完成项 |
|---|---|---|---|
| M0 五源首发 | `COMPLETED` | GitHub Actions rollout `34927903792`；生产审计 `audits/ich/production/latest/`、`audits/ich/procurement/phase1-2/latest/` | 未观察自然 72h 周期，仅完成受控两轮；timer 已恢复 enabled/active |
| M1 工作台 | `COMPLETED`（代码交付） | `npm run verify:procurement:workbench`、`npm run verify:procurement:change-feed` | 当前分支尚未部署到线上，需后续受控发布 |
| M2 高价值扩源 | `COMPLETED`（最低目标） | `audits/ich/procurement/autonomous-v1/latest/` | 4 个新源真实接入；另外 5 个候选诚实记录为阻塞/延期 |
| M3 业务交付 | `SHIPPED_WITH_BACKLOG` | 本报告与 `BUSINESS_DIGEST.md` | 采购真实公开样本只有 3 条，不能凑数；尚未发布工作台 |

## 三、最值得跟进的真实采购机会

生产公开池当前只有 3 条采购机会，均来自公开官方采购数据，不能把“相关”写成“可直接中标”：

1. **Spain – Cultural event organisation services**；买方未从当前记录解析；GLOBAL；截止 `2026-10-06T21:59:00Z`；[TED 官方公告](https://ted.europa.eu/en/notice/-/detail/616562-2026)。适配判断：文化活动组织/供应链服务可能涉及内容与活动执行；预算、资格、交付地点待核验。
2. **Festive Pantomime Maesteg Town Hall & The Met, Abertillery 2026/27**；买方 Awen Cultural Trust；英国威尔士；截止日期当前记录未解析；[Sell2Wales 官方公告](https://www.sell2wales.gov.wales/Search/Search_Switch.aspx?ID=160359)。适配判断：舞台/活动制作类需求；本地履约、资质、场地与响应期限需核验。
3. **Amgueddfa Cymru - Events Production Sain Ffagan - Christmas 2026**；买方 Amgueddfa Cymru - National Museum Wales；英国威尔士；截止日期当前记录未解析；[Sell2Wales 官方公告](https://www.sell2wales.gov.wales/Search/Search_Switch.aspx?ID=161624)。适配判断：博物馆节庆活动制作，可能涉及活动执行；不代表已有资格或确定订单。

预算、资格、履约障碍和报名入口不完整处均保留为“待核验”，详见生产 API 和工作台评估字段。

## 四、来源真实贡献

### 已有生产来源

固定业务 release 生产 registry 为 38 条，生产运行两轮均为 `source_count=38`；5 个原 Phase 1 核心采购源在首发中完成启用并有运行证据。可定位证据：`audits/ich/procurement/latest/sources.json`、`audits/ich/production/latest/source-overview.json`、workflow `34927903792`。

### 本轮新增并接通（不是生产新增）

| ID | 来源 | 结果 | live 读取 |
|---|---|---|---:|
| `proc-cn-gzsun` | 广州阳光采购服务平台 | `LIVE_OK` | 200 / 6 条 |
| `proc-cn-csg` | 南方电网供应链统一服务平台 | `LIVE_OK` | 200 / 12 条 |
| `proc-cn-gz-wglj` | 广州市文化广电旅游局招标采购 | `LIVE_OK` | 200 / 11 条 |
| `proc-uk-contracts-finder` | UK Contracts Finder | `LIVE_OK` | 200 / 62 条 |

这 4 条通过同一 Opportunity V2 主 Pipeline 的 dedicated adapter、解析、去重和公开过滤；隔离运行结果为 raw 91、pool 80、public relevant 4。它们在本分支默认注册为 disabled/PENDING，不冒充已上线生产。

候选处置全量见 `audits/ich/procurement/autonomous-v1/latest/candidate-dispositions.json`：广东政府采购智慧云直连超时、香港 GLD API 未确认、深圳阳光平台无法稳定打开，南方招标与 AIIB 延期；均为 `NOT_INTEGRATED`，没有伪造 live success。FTS / CanadaBuys 是既有来源，未重复计入新增。

## 五、用户流程验收

| 流程 | 结果 | 证据 |
|---|---|---|
| 采购卡/适配理由/资格待核验 | `PASS` | `npm run verify:procurement:workbench` |
| 当前/提前/研究三分区 | `PASS` | 同上；历史/意向不会写成当前订单 |
| 官方证据链接 | `PASS` | 详情路由与 `detail_url/source_url` 输出 |
| 私有跟进保存与未授权拒绝 | `PASS` | followup store + route fixture |
| 刷新保留 | `PASS` | owner sidecar 原子写入/读取 fixture |
| 变更摘要去重 | `PASS` | `npm run verify:procurement:change-feed` |
| CSV / Markdown 导出 | `PASS` | 公式注入转义、无私有备注 |
| 过期/取消不作为当前采购 | `PASS` | `assessProcurement` 分区规则与 fixture |
| 页面线上可访问 | `NOT_RUN` | M1 本轮未部署；禁止以本地预览冒充线上 |

## 六、生产与回滚证据

- 合并控制面：PR #4 已合并，控制面最新 SHA `b3fcda3cdd5113ba7388dfd37c5cdc853eda8b0f`。
- 固定业务 release：`f514ee6b624dc2bb5abf12bb317cb30c37bedb5d`，未移动 tag。
- workflow：`34927903792`，candidate/control gates、两轮抓取、去重、回归、公网 smoke 全部通过。
- 首发 release：`20260915T041344Z-f514ee6b624d`。
- previous release / rollback target：`/opt/chanceping/releases/20260913T153750Z-c14bf9710218`。
- runtime backup：`/var/lib/chanceping/backups/opportunity-v2-phase1-2b-20260915T041343Z`。
- 生产 quality gates：seller offer、awarded/cancelled、无关采购等均为 0；unsafe 截止日期结构化公开值为 0；public encoding error 为 0。
- 生产 HTTP smoke：`/health`、`/ich`、`/ich/memo`、`/ich/memo.json`、`/ich/memo.md`、`/api/opportunity-v2/radar`、`/api/opportunity-v2/sources`、`/opportunity-v2/admin/sources` 均 200。
- 采购生产公开数量：3。LOEWE 的固定业务回归 ID 保留；当前宽标题检索仍会命中 3 条相关标题卡，严格“公开只显示一次”的产品收敛仍列 backlog，不能在本报告伪称为一次。

## 七、测试与遗留

本分支执行并通过：

- `npm run typecheck`
- `npm run verify:procurement:workbench`
- `npm run verify:procurement:sources`
- `npm run verify:procurement:change-feed`
- `npm run verify:ich:v211`
- `npm run verify:ich:procurement:phase1:2a`

M0 已在生产 workflow 中通过：`verify:v15:e2e`、`verify:v15`、`verify:v16`、`verify:all`、`verify:ich:v211`、`verify:ich:procurement:semantic`、control-plane 91/91。M2 live audit 是隔离读取（`production_mutated=false`、`synthetic_fixture_published=false`），不是生产抓取。

已知 baseline limitation：历史审计曾截断身份样本，仍保留 `HISTORICAL_PROVENANCE=PARTIAL_UNRECOVERABLE`；本轮没有伪造恢复，也没有把它改成当前丢失。

## 八、Jason 需要处理的唯一集中清单

后续若要上线 M1/M2，需要一次受控发布审批；另外 5 个候选来源是否投入适配，需要按上面真实 blocker 决定。没有订阅、注册、投标或外部通知操作。

## 九、下一步建议

下一轮最有价值的目标是：在不影响现有赛事与 M0 采购的前提下，先发布 M1 工作台到隔离/预生产并做真实点击验收，再决定是否为 `proc-cn-gzsun` 等新增源开启生产注册；不要继续盲目扩源。
