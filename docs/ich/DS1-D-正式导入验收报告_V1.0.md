# DS1-D 正式导入验收报告 V1.0

本报告由受控导入脚本生成，记录单条待批准草稿从 `draft` 经 `pending_review`、`approved` 到 `published` 的完整工作流。导入范围严格限制为 1 条，正式库必须只增加 1 条且产生可恢复备份。

机器记录：[DS1-D-正式导入验收_V1.0.json](/Users/1sunflower/Documents/chanceping/docs/ich/DS1-D-正式导入验收_V1.0.json)。

验收要求：

- 导入前完成来源可达、截止日期、字段校验、DS0 语义和去重检查；
- 工作流修订号连续递增；
- 正式库条目数增量为 `+1`；
- 最终状态为 `published` 且 `is_published=true`；
- 导入后再次运行语义检查和完整回归；
- 保留导入前后 SHA-256 及原子写入备份证据。
