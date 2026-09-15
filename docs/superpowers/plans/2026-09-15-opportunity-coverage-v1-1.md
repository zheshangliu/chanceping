# Opportunity Coverage V1.1 实施计划

## 目标与边界

在 `fb3a6edcac2dbee826ea6bb13d70a01374961397`（上一包采购工作台交付）之上，复用现有 Opportunity V2、来源注册、采购工作台、跟进、变更摘要、导出、认证边界和纸张视觉，增加非赛事机会的兼容覆盖视图。`/ich` 赛事 Radar、赛事 Memo、现有采购默认视图和五源生产能力保持原契约；本包不部署生产、不新增数据库、不新增调度器、不进行付费或需登录抓取。

## N0 基线与交接

1. 记录上一包最终报告、上一包业务 SHA、当前生产业务 SHA 与控制面 SHA、生产来源与运行状态；将生产路径标记为 `PRODUCTION_READ_ONLY`。
2. 对 `sources.json` 做只读来源家族盘点，去重同域/同机构栏目；输出来源注册状态、最近健康、独有贡献和待验证原因。
3. 在隔离副本执行上一包采购工作台、跟进、变更摘要、来源和 typecheck 回归；输出 `HANDOFF.json`、`source-inventory.json`、`baseline.json`。

## N1 兼容覆盖视图

1. 先写 `verify-opportunity-coverage.ts` 的失败夹具，覆盖作品征集、资助驻留、培训采购、研修招募、渠道选品、合作委托、孵化受理、结果公示、销售方自荐与历史/无状态内容。
2. 新增单一机会 ID 的轻量 `opportunity-coverage.ts`：从标题、摘要、标签和既有采购元数据生成六类视图、current/early/review/research/excluded 行动分区、money_flow、证据、资格缺口和下一步；证据不足只进 REVIEW，不依赖一个宽泛关键词，不改原 `category`。
3. 复用现有跟进 store、change feed、export 和公开 deadline serializer；将工作台列表、详情、导出扩展为显式 `view` 参数，默认采购行为不变；增加 `/ich/opportunities` 兼容入口和对应 API。
4. 增加真实数据只读覆盖审计，输出六类去重机会计数和真实样本；旧赛事/采购对象保留原 ID，覆盖判断为旁路 assessment。

## N2 有界来源补漏

1. 优先复用 On the Move、CuratorSpace、American Craft Council、Craft Scotland、ArtConnect、Heritage Crafts、KCDF、Homo Faber 等已注册家族，最多深挖六个。
2. 仅对国家艺术基金、EEN、广州文旅非采购栏目三个候选做两条合规公开访问路径以内的验证；不把历史详情、公示、受限/503 页面写成 LIVE，黄埔只作历史负例证据。
3. 对每个来源保存 `REGISTERED`、`WEB_OBSERVED`、`PIPELINE_VERIFIED`、`PRODUCTION_ACTIVE` 分层状态、访问时间、HTTP/解析证据、独有相关贡献和 blocker；同一机构采购栏目与非采购栏目不重复计 Source family。
4. 对可复用公开列表写最小通用 parser/fixture；没有稳定入口或许可边界的来源保留 blocker，不伪造产量。

## N3 交付与验证

1. 生成 `audits/ich/opportunity-coverage-v1-1/latest/` 的交接、来源、覆盖矩阵、分类、用户流程、运行和发布证据，并生成 `reports/ich/opportunity-coverage-v1-1/FINAL_DELIVERY.md` 与 `BUSINESS_DIGEST.md`。
2. 执行 N1 夹具、真实副本审计、采购/赛事回归、typecheck、`verify:all` 及 UI/API 工作台 smoke；将 `FIXTURE_EXECUTED`、`LIVE_READ`、`PRODUCTION_EXECUTED` 分开记录。
3. 只暂存本包相关文件，提交清晰 commit，使用 ChancePing Push skill 推送 `codex/opportunity-coverage-v1-1`；不部署生产。若来源或端到端生产审批不足，状态为 `SHIPPED_WITH_BACKLOG` 或 `EXTERNAL_BLOCKED`，不将静态验证称为线上成功。

## 文件边界

- 业务旁路：`src/opportunity-v2/opportunity-coverage.ts`、工作台路由/页面与最小导出/变更 feed 适配。
- 测试：`scripts/verify-opportunity-coverage.ts` 及必要的非业务 fixture。
- 审计/报告：只写本包命名空间 `audits/ich/opportunity-coverage-v1-1/`、`reports/ich/opportunity-coverage-v1-1/`。
- 不修改赛事规则、Legacy ICH、生产 runtime、DNS、secret、无关 benchmark/headhunter 文件。
