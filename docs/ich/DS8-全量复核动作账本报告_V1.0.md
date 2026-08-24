# DS8 全量复核动作账本报告 V1.0

- 阶段：**DS8-R2**
- 队列输入：114 条（原始任务书口径至少 107 条）
- 已逐条处理：114 条
- 主来源可访问：86 条；不可访问：28 条
- 正式库写入：**false**
- 正式库前后哈希一致：**true**
- 门禁：**pass_with_followups**

## 处置分布

- archive_review: 34
- manual_field_review: 40
- source_unavailable: 28
- ready_for_manual_confirmation: 4
- duplicate_review: 8

## 说明

本账本是只读健康与字段复核，不等同于人工确认，也不自动把任何记录晋级为正式机会。所有记录保持 `formal_publish_blocked=true`；下一步按 `manual_field_review`、`archive_review` 和 `source_unavailable` 队列进行人工处置。

机器记录：[DS8-全量复核动作账本_V1.0.json](./DS8-全量复核动作账本_V1.0.json)。
