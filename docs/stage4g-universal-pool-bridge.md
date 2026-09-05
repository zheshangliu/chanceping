# Stage 4G｜Universal Opportunity Pool Bridge

本阶段采用只增加映射、不复制机会的桥接方式。

| canonical opportunity | source radar | target radar | radar_tags | bridge status |
|---|---|---|---|---|
| LOEWE FOUNDATION Craft Prize 2027 | Global Competition | ICH | Design, Craft, International（是否加 ICH 需按传统工艺证据） | repaired, not migrated |
| 2026 Gyeongnam K-Design Award | Global Competition | ICH | Design, Craft, Culture, International | imported to ICH; source_radar provenance retained in report |
| 重庆好礼·渝礼相遇 | Global Competition | ICH | Design, Culture, ICH, Business | imported to ICH |
| 讲好中国故事·AI创作主题赛 | AI Events | ICH + AI | AI, Culture, ICH, Game | imported to ICH; AI provenance retained |

正式 schema 暂不新增字段，避免影响既有 AI Events/Business Radar。后续 Universal Pool 以 canonical official URL/external_id 去重，并将 radar_tags、source_radar_refs 和 EvidenceItem 作为桥接层。
