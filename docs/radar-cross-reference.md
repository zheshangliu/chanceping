# ChancePing 跨雷达机会映射设计

本阶段只定义审计和映射，不写入统一机会池。

## Mapping Contract

```json
{
  "source_radar": "Global Competition | AI Events | ICH",
  "target_radar": "ICH",
  "mapping_reason": "可解释的文化/非遗/工艺/文创/博物馆/文旅关联",
  "confidence": "high | medium | low",
  "action": "retain | candidate_review | official_backtrace | do_not_merge"
}
```

## 统一 Opportunity Tags

| tag | owner | ICH policy |
| --- | --- | --- |
| AI | AI Events | 仅当同时命中文化/非遗/博物馆/传统工艺或文化IP语义时进入 ICH 候选 |
| Design | Global Competition / custom radars | 文创、工艺美术、文旅礼物或文化设计进入候选；普通工业/UI/平面设计保留原雷达 |
| Craft | Global Competition | 手工艺、artisan、traditional craft 进入候选 |
| ICH | ICH Radar | 正式发布仍以 ICH Evidence/DS3/DS14 门禁为准 |
| Culture | ICH / AI Events | 文化创作、博物馆、文化遗产相关机会进入候选 |
| Game | AI Events | 仅传统文化/非遗数字化或文化叙事游戏进入候选 |
| Education | AI Events / ICH | 非遗研学、传承培训、博物馆教育可进入候选 |
| Business | Business Radar / ICH | 文创采购、供应商、渠道合作需官方行动入口 |

## 迁移门禁

- `ich_candidate=true` 只表示进入审核队列，不代表 `is_published=true`。
- 主来源 URL、申请入口、截止时间、适用对象和证据必须重新通过 ICH DS3/DS14。
- AI/设计/游戏等跨域机会必须有明确文化/非遗关联；普通 AI、普通软件、普通设计赛事保留原雷达。
- 统一机会池应先建立只读索引和 provenance，再考虑受控导入；当前不执行导入。
