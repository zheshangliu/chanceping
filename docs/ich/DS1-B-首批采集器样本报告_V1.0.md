# DS1-B 首批采集器样本报告 V1.0

## 1. 范围与边界

本轮按 DS1 设计实现 3 个候选模式适配器，并各取 3 个实时官方详情页样本：

| 适配器 | 来源 | 发现入口 | 样本数 |
|---|---|---|---:|
| `ccgp-procurement-listing-v1` | 中国政府采购网 | 地方公告列表 | 3 |
| `gd-culture-notices-v1` | 广东省文化和旅游厅 | 通知公告列表 | 3 |
| `yuexiu-notices-v1` | 越秀区人民政府 | 通知公告列表 | 3 |

运行记录：[DS1-B-候选样本运行记录_V1.0.json](/Users/1sunflower/Documents/chanceping/docs/ich/DS1-B-候选样本运行记录_V1.0.json)。适配器实现：[source-adapters-v1.ts](/Users/1sunflower/Documents/chanceping/src/ich/source-adapters-v1.ts)。

适配器只读取列表与详情页，生成 `candidate_only` 样本；只保存字段、来源 URL、原始快照 SHA-256 和逐字段 provenance，不保存 HTML 快照，不写入 `src/ich/opportunities.verified.json` 或正式机会库。

## 2. 字段契约

每个样本均包含：

- `title`、`organizer`、`deadline_text`、`geography`、`category_hint`、`source_url`；
- `discovery_url` 和详情页 `source_url` 的分离；
- `raw_snapshot_hash`；
- 每个字段的 `method`、`evidence_excerpt` 和 `confirmed`；
- `review_state=candidate_only`。

无法从页面确认的字段保持 `null`，不使用标题、来源名称或相邻记录补猜。来源级地区和分类提示标记为 `confirmed=false`，只能作为后续候选审核输入。

## 3. 实际样本观察

- 中国政府采购网：3/3 样本取得官方详情 URL、标题和采购单位；本次动态列表中 1/3 样本提取到未来响应/开标时间，另外 2 条为更正公告且未出现可确认截止字段；地区字段未从详情页统一提取，保持未确认。
- 广东省文化和旅游厅：3/3 样本取得官方详情 URL、标题和作者/部门；其中 1 条提取到截止日期，其余没有明确截止字段，保持 `null`。
- 越秀区通知公告：3/3 样本取得官方详情 URL、标题；1 条提取到提交资料截止文本，其余字段保持未确认。

这些样本证明“候选模式可以提取”，不证明样本本身符合非遗机会发布条件。当前样本中存在普通采购、结果公示和行业通知，必须在 DS1-C 做非遗相关性、行动性、状态和重复审计后才能进入候选队列。

## 4. DS1-B 门禁

### 通过项

- 3 个适配器均成功运行；
- 每个适配器均有至少 3 个真实官方详情页样本；
- 9 个样本均保留详情 URL、快照哈希和逐字段 provenance；
- 不确定字段保持 `null` 或 `confirmed=false`；
- 运行未修改正式机会库、候选库、环境变量、DNS 或部署配置。

### 尚未通过项

- 适配器仍是候选模式，未声明 `adapter_ready`；
- 尚未执行 DS1-C 的语义、去重、地区、状态和非遗相关性审计；
- 尚未允许批量采集或正式发布；
- `ccgp` 详情页的地区提取仍需专门字段规则，不能从采购单位名称推断地区。

**DS1-B 结论：通过候选样本门禁，可进入 DS1-C 候选审计；不允许进入 DS1-D 正式发布。**

## 5. 复核命令

```bash
npm run typecheck
npm run ich:ds1b:sample-adapters
```
