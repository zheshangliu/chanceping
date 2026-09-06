# Stage 5-A Batch 2 受控导入日志

| 批次 | DS3 | DS14 | 正式库变化 | 写入方式 |
|---|---:|---:|---:|---|
| `stage5a-batch-02` | 10 | 10 | 137 → 147 | `IchPublicationService.create` + `submitted` → `approved` → `published` |

## 导入前后哈希

- before SHA-256：`6d9e534d25b50139e62001c53ea64a817419bc04c26b80ae171fa4a1e8cbad15`
- after SHA-256：`070039a90e13420146af3c68bc4a8269b2b76af251d0a2c7a8d401bf0dd92c67`

## 本批规则

- 单批上限 10 条，未超限。
- 去重检查覆盖 id、slug、主来源 URL 和语义相似度。
- 未确认费用记录为 `not_disclosed`；未确认地域记录为 `partial/unknown`，未推断为全球开放。
- 生产环境未部署，DNS 未修改。
