# Universal Opportunity Pool 方案（准备稿）

## 目标

将 ChancePing 的多个雷达统一到一份机会资产上：一次规范化、一次证据链、多个雷达视图和用户画像，不再让 AI Events、Global Competition、ICH 各自复制同一机会。

```text
Official Source
      ↓
EvidenceItem[]
      ↓
Canonical Opportunity
      ├── radar_tags[]
      ├── user_profiles[]
      ├── opportunity_stage
      ├── ranking_by_radar
      └── review / publish workflow
```

## 建议结构

```json
{
  "id": "canonical opportunity id",
  "external_ids": [],
  "canonical_source_url": "https://official.example/opportunity",
  "radar_tags": ["AI", "Culture", "ICH"],
  "user_profiles": ["heritage_master", "craft_studio", "creative_company"],
  "opportunity_stage": "open_application",
  "evidence": [],
  "source_radar_refs": ["ich", "ai-events"],
  "ranking": {},
  "workflow": {}
}
```

## 关键设计

1. **唯一性**：canonical official URL、external_id 和语义去重共同决定唯一机会；雷达标签不产生新记录。
2. **证据统一**：保留 ICH 现有 `field_provenance`，同时映射到通用 `EvidenceItem`；每个关键字段要有来源、抓取时间、可访问状态和核验状态。
3. **雷达视图**：查询层按 `radar_tags`、用户画像和机会类型筛选；正式库只保存一条 canonical record。
4. **评分隔离**：通用事实字段共享，`ICH score`、`AI score` 等雷达评分可并存，不能互相覆盖。
5. **生命周期**：`open_application`、`open_call`、`project_invitation`、`policy_program`、`announcement_only`、`historical_record` 明确区分；公告不能伪装成可申请机会。
6. **人工门禁**：低证据或跨雷达冲突进入 review queue；没有 L1 官方详情页的候选不得自动发布。

## 分阶段落地

### 4F（当前）

只做字段审计、标签设计和映射报告；正式库不变。

### 4G（建议）

先修复 LOEWE/iF/中华设计奖记录，给 6 条候选补齐官方 Evidence 包；仍按单批不超过 10 条受控导入。

### 5（后续）

在通过 DS3/DS14 后才建立统一机会池索引，并用 `radar_tags` 驱动 ICH、AI Events、Global Competition 的独立视图。

## 本方案不包含

- 不改变现有正式机会库 schema；
- 不自动迁移 AI 赛事；
- 不把周报或聚合页当作官方事实；
- 不在本阶段部署或修改 DNS。
