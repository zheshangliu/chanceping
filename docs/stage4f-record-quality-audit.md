# Stage 4F｜正式机会记录质量审计

本报告只读检查 `data/ich-opportunities.json`，并与 2026-08-31 全球赛事周报及官方来源口径对照。未修改正式机会库。

## 结论

- 当前正式库仍为 124 条，文件哈希保持 Stage 4E 基线：`8f194c1b4ccb7a32d1205761c81edc00ceafaa98244c78adf133ec8932556fdf`。
- 发现至少 10 个字段级风险，主要是跨记录模板串写，不是数量问题。
- 本阶段只形成修复清单；修复前不允许把这些记录作为统一机会池的可信字段直接复用。

## 风险清单

| opportunity | risk_type | current_value | recommended_fix | evidence |
|---|---|---|---|---|
| LOEWE FOUNDATION Craft Prize 2027 | 申请主体错误 | `individual, enterprise, organization, school` | 按 LOEWE 2027 官方规则改为年满 18 岁的专业工艺艺术家个人/创作团队；企业不得直接报名。 | 下载周报第 2.3 节；官方规则页 `https://craftprize.loewe.com/zh/craftprize2027` |
| LOEWE FOUNDATION Craft Prize 2027 | 奖金字段错误 | `1,000,000 CNY` | 改为官方表述最高 `€50,000`，币种 EUR；未知金额不得换算成 CNY 作为原始字段。 | 同上 |
| LOEWE FOUNDATION Craft Prize 2027 | 申请步骤串写 | 出现“登录 DIA 报名系统”“选择 DIA 文化创新类别” | 删除 DIA 步骤，重新记录 LOEWE 官方入口、作品条件和提交方式。 | `data/ich-opportunities.json` 当前记录；LOEWE 官方页 |
| LOEWE FOUNDATION Craft Prize 2027 | 时区风险 | `deadline_text` 为 CET，但 `timezone=Asia/Shanghai` | 使用官方固定时区文字；在未确认 IANA 映射前不要用本地时区参与排序/提醒。 | 官方规则 PDF与周报 |
| LOEWE FOUNDATION Craft Prize 2027 | 资格说明串写 | `eligibility_text` 引用 DIA 规则 | 重写为 LOEWE 资格与独家许可说明，并保留版权风险。 | 当前记录与周报第 2.3 节 |
| iF DESIGN AWARD 2027 Regular报名 | 申请步骤串写 | 复用 DIA 报名系统步骤 | 改为 iF 官方入口及费用、Jury Fee、Winner Fee 流程。 | `https://ifdesign.com/en/if-design-award-page-new`、FAQ |
| iF DESIGN AWARD 2027 Regular报名 | 发布策略与周报冲突 | 正式库 `is_published=true`；周报按强制 Winner Fee 规则淘汰 | 由产品规则决定保留为观察/风险记录还是撤下推荐；不得静默删除。 | 周报第 6.2 节 |
| 2026中华设计奖常设赛道 | 申请步骤串写 | 复用 DIA 报名系统、DIA 类别 | 改为 CIDIP 常设赛道自己的组别、概念组/产品组和递交要求。 | `https://www.cidip.cn/cda2026/permanent.html` |
| 2026中华设计奖常设赛道 | 奖金字段未被周报确认 | 正式库 `1,000,000 CNY`；周报明确未取得常设赛道奖金字段 | 改为 `未确认`，不得从其他赛事继承金额。 | 周报第 4 节 |
| 跨记录模板 | 日期/状态文本复用 | 多条记录出现 DIA 的截止、时区或流程句式 | 建立逐记录字段校验；发布前检查标题、来源域名、申请步骤、奖金和时区是否同源。 | 当前正式库抽样 |

## 修复门禁

1. 先修复并重新核验 LOEWE、iF、中华设计奖；
2. 对每条记录生成字段级 evidence 引用；
3. 重新运行完整性、DS3 和去重检查；
4. 通过后才能进入 Universal Opportunity Pool 映射，不能用本报告直接导入。
