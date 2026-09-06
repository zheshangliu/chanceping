# Stage5-A.4 聚合机会源自动发现网络运行报告

运行时间：2026-09-06T05:57:39.313Z
只读：是；正式库写入：否
正式库哈希保持不变：是

## 来源与适配器

| source_id | items_seen | new | relevant | official_backtrace_success | adapter_status |
| --- | ---: | ---: | ---: | ---: | --- |
| shejijingsai-list | 120 | 0 | 23 | 0 | PASS |
| contest-watchers-open | 10 | 0 | 0 | 0 | PASS |
| crafts-council-opportunities | 0 | 0 | 0 | 0 | BLOCKED |
| artconnect-opportunities | 52 | 0 | 1 | 0 | PASS |
| competitions-archi | 0 | 0 | 0 | 0 | PARSER_FAILED |

## Funnel

```json
{
  "raw_items_seen": 182,
  "new_items": 0,
  "updated_items": 0,
  "unchanged_items": 182,
  "removed_items": 0,
  "rule_relevant": 39,
  "semantic_relevant": 24,
  "official_backtrace_attempted": 10,
  "official_backtrace_success": 0,
  "qualified_candidates": 0,
  "rejected_candidates": 143,
  "ds3_pass": 0,
  "ds14_imported": 0
}
```

## Baseline

- baseline_total: 182
- currently_open: 182
- already_expired: 0
- likely_relevant: 24
- incremental_simulation.new_items: 0
- incremental_simulation.updated_items: 0

## Stage5 KPI

- direction_aware_ich_actionable: 47 → 47 / 80

## Gate

- pass_with_followups
- 聚合站只负责发现；没有 `OFFICIAL_FOUND` 的候选不得进入正式库。
- 官方回溯无法使用搜索 Provider 时标记 `PENDING_PROVIDER`，不伪造成功。
