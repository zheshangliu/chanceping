# HeadHunter Domain Model

Phase 5 的 HeadHunter 垂直域与 ChancePing Core 解耦。Company 是长期实体；WeeklyLeadSnapshot 是每周机会快照；TrendIntelligence 独立于 A/B LeadPool。

## 不变量

- `LeadPool` 只有 `A_ACTIONABLE`、`B_ENRICHMENT`、`ARCHIVED`，不得出现 C；C 使用 `TrendIntelligence`。
- Raw Evidence 使用不可变字段保存，人工修正写入独立的 `human_override`，不覆盖原始证据。
- Person 与 ContactEntry 分离。LinkedIn profile 不是默认可验证 ContactEntry；只有公开且职业化的邮箱、电话、招聘/联系表单等入口才可满足 Contact Gate。
- `explicit_required`、`explicit_preferred`、`not_mentioned` 只表示原文明确程度，不从地区、职位或行业名称推断 RA1/Cantonese。
- `verified_current`、`likely_current`、`stale`、`unknown` 明确区分当前任职核验状态。
- 每家公司每周只能有一条正式 `WeeklyLeadSnapshot`，由后续 Store 层实施唯一性约束。

## 实体

| 实体 | 作用 |
|---|---|
| Company | 公司长期身份、官方域名、地区、行业与主体范围 |
| CompanySignal | 公司事件；`fact_summary` 与 `inference_summary` 分离 |
| RawEvidence | 原始来源与抓取证据，不可修改 |
| Job / JobObservation | 长期岗位实体与每次扫描观察，用于新增、持续、重发、关闭、重开 |
| Person | 公开职业身份与当前公司/职位 |
| ContactEntry | 公开职业/企业触达入口 |
| NeedInference | 从明确招聘或高可信事件推断的岗位需求 |
| WeeklyLeadSnapshot | 公司每周 A/B 快照、Gate、评分、行动和话术 |
| TrendIntelligence | 独立的政策/市场/行业/招聘市场趋势 |
| RadarRun | 一次 scheduled/manual 雷达运行及 Provider 成本摘要 |
| WeeklySnapshot | 本周正式发布容器，包含 Lead 与 Trend |

## 时间与评分字段

所有时间字段存 ISO-8601 字符串。`computeWeekKey()` 默认按 `Asia/Shanghai` 计算 ISO 周，例如 `2026-09-07T00:00:00+08:00` 为 `2026-W37`。评分字段使用 number；BusinessScore、FreshnessScore 与 FinalRankScore 的冻结公式由后续 scoring engine 实现，本模型不重新定义权重。
