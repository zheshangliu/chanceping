# Stage 4F｜跨雷达映射报告

| opportunity | source_radar | target_radar | reason | processing |
|---|---|---|---|---|
| 金茶花国际文创设计大赛 | Global Competition | ICH | 官方赛道含非遗老字号、文创和伴手礼；已在 ICH | `dual_tag`（Design/ICH），保持单条记录 |
| LOEWE Craft Prize 2027 | Global Competition | ICH | 工艺奖与传统工艺当代表达高度相关；字段修复前不作为可信共享记录 | `dual_tag` after repair |
| 中华设计奖常设赛道 | Global Competition | ICH | 官方页面含文博文创、非遗再造、传统工艺创新 | `dual_tag` after repair |
| 重庆“渝礼相遇” | Global Competition | ICH | 博物馆文创/城市礼物，适合非遗文创团队 | `candidate_for_import` |
| Gyeongnam K-Design Award | Global Competition | ICH | 官方含 Product and Craft / Contemporary Crafts | `candidate_for_import` |
| 北京文博创意设计大赛 | Global Competition | ICH | 文博文创方向明确，但缺开放申请字段 | `keep` |
| Red Dot Product Design 2027 | Global Competition | ICH | 仅有设计产品方向，非遗关联未确认 | `keep` |
| 讲好中国故事·AI 创作主题赛 | AI Events | ICH + AI | 官方启事明确“非遗新生”及 AI 交互/H5 | `candidate_for_import` |
| 两岸（青岛）青年 AI 作品创作大赛 | AI Events | ICH + AI | 周报称含中华传统文化/非遗，但目前只有聚合页 | `candidate_for_import` after L1 backtracking |
| AI 东方·京东 AI 影视创作大赛 | AI Events | AI/Culture | 有文化影视内容，但无明确 ICH 行动信号 | `keep` |
| 腾讯 AI 游戏、AWS、Google Agentic、千问办公 | AI Events | AI/Business/Game | 与非遗目标无直接官方语义关联 | `ignore` for ICH |

## 处理原则

- `keep`：留在来源雷达观察，不进入 ICH；
- `dual_tag`：已有规范机会只增加标签设计，不复制记录；
- `candidate_for_import`：进入官方回溯队列，未通过 DS3 前不能发布；
- `ignore`：当前不符合 ICH 语义边界。
