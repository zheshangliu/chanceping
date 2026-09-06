# Stage5-A.4 聚合机会源自动发现网络运行报告

运行时间：2026-09-06T06:23:13.178Z
只读：是；正式库写入：否
正式库哈希保持不变：是

## 来源与适配器

| source_id | items_seen | new | relevant | official_backtrace_success | adapter_status |
| --- | ---: | ---: | ---: | ---: | --- |
| shejijingsai-list | 200 | 0 | 44 | 0 | PASS |
| chuangsaiyun-competition-list | 107 | 0 | 19 | 0 | PASS |
| contest-watchers-open | 10 | 0 | 0 | 0 | PASS |
| crafts-council-opportunities | 0 | 0 | 0 | 0 | BLOCKED |
| artconnect-opportunities | 52 | 0 | 1 | 0 | PASS |
| competitions-archi | 0 | 0 | 0 | 0 | PARSER_FAILED |

## Funnel

```json
{
  "raw_items_seen": 369,
  "new_items": 0,
  "updated_items": 0,
  "unchanged_items": 337,
  "removed_items": 0,
  "rule_relevant": 81,
  "semantic_relevant": 64,
  "official_backtrace_attempted": 10,
  "official_backtrace_success": 0,
  "qualified_candidates": 0,
  "rejected_candidates": 256,
  "ds3_pass": 0,
  "ds14_imported": 0
}
```

## Baseline

- baseline_total: 337
- currently_open: 336
- already_expired: 1
- likely_relevant: 64
- incremental_simulation.new_items: 0
- incremental_simulation.updated_items: 0

## Stage5 KPI

- direction_aware_ich_actionable: 47 → 47 / 80

## Gate

- pass_with_followups
- 聚合站只负责发现；没有 `OFFICIAL_FOUND` 的候选不得进入正式库。
- 官方回溯无法使用搜索 Provider 时标记 `PENDING_PROVIDER`，不伪造成功。
