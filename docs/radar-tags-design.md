# Radar Tags 统一模型（Stage 4F）

## 目标

同一个机会可以被多个雷达发现，但只保留一份规范机会记录。雷达归属通过 `radar_tags` 表达，不复制机会、不为每个雷达生成独立副本。

```json
{
  "radar_tags": ["Design", "Craft", "ICH", "International"]
}
```

## 受控词表

| tag | 含义 | 进入条件 |
|---|---|---|
| `AI` | AI 创作、Agent、AI 工具或 AI 赛道 | 官方规则明确 AI 为主题、工具或赛道 |
| `Design` | 设计奖、产品设计、视觉/交互设计 | 官方赛道或规则明确设计类别 |
| `Craft` | 手工艺、工艺美术、artisan/craft | 官方规则明确工艺或手工制作 |
| `ICH` | 非遗、传统工艺、文化遗产或传承人 | 官方规则明确相关主题/赛道/资格 |
| `Culture` | 文博、文化传播、城市文化、传统文化 | 官方规则明确文化内容，但未必是 ICH |
| `Game` | 游戏、互动叙事、可试玩作品 | 官方规则明确游戏或互动作品 |
| `Education` | 教育、学生组、研学或人才培养 | 官方规则明确教育/学生/培训对象 |
| `Business` | 采购、供应商、联名、渠道或商业合作 | 官方规则存在商业交易/合作行动入口 |
| `International` | 跨境开放或国际主办/全球参与 | 官方规则明确国际/全球范围 |

## 规则

1. `ICH` 不能仅由“文化”或“设计”推断；必须有非遗、传统工艺、文化遗产或明确相关赛道证据。
2. `AI + Culture` 不自动等于 `ICH`；只有“非遗新生”“传统文化/非遗赛道”等强信号才加 `ICH`。
3. `Craft` 与 `ICH` 可以并存，但现代工艺奖不必然是非遗机会。
4. 来源雷达是发现上下文，不是机会主键；主键仍按 canonical official URL/external_id 去重。
5. 标签变化需要保留 evidence 和审核时间，不直接覆盖历史审计结果。

## Stage 4F 映射示例

```json
{
  "title": "LOEWE FOUNDATION Craft Prize 2027",
  "radar_tags": ["Design", "Craft", "International"],
  "ICH": "需按非遗/传统工艺关联证据决定，不能由 Craft 单独推断"
}
```

```json
{
  "title": "讲好中国故事·AI 创作主题赛",
  "radar_tags": ["AI", "Culture", "ICH"],
  "evidence": "周报明确列出‘非遗新生’主题；正式导入前仍需官方报名规则"
}
```
