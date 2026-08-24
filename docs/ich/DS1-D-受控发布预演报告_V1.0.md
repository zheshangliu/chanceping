# DS1-D 受控发布预演报告 V1.0

## 1. 预演边界

本轮只对 DS1-C 审计结果做发布前预演，不执行任何正式导入：

- 不写 `data/ich-opportunities.json`；
- 不修改 `src/ich/opportunities.verified.json`；
- 不调用发布接口；
- 不部署、不提交、不合并。

预演记录：[DS1-D-受控发布预演_V1.0.json](/Users/1sunflower/Documents/chanceping/docs/ich/DS1-D-受控发布预演_V1.0.json)。

## 2. 结果

| 项目 | 结果 |
|---|---:|
| 输入候选 | 9 |
| 可正式发布 | 0 |
| 预计新增 | 0 |
| 预计更新 | 0 |
| 正式机会库写入 | `false` |

阻断原因：

1. DS1-C 对所有样本设置了 `formal_publish_blocked=true`；
2. 9 条都还没有完成人工审核批准；
3. 截止、地区、分类和非遗相关性仍有未确认字段；
4. 部分样本是普通采购或结果公示，不应直接冒充非遗机会。

**DS1-D 当前结论：`not_ready`。预演本身通过安全门禁，但正式发布门禁保持关闭。**

## 3. 进入正式发布前必须补齐

- 对具体候选逐条确认是否与非遗手艺人、工作室、品牌或文创团队有行动关联；
- 回到详情页确认主办方、地区、截止日期、申请方式和资格；
- 为通过项生成完整 `IchOpportunity`，并通过现有校验、去重和 DS0 语义门禁；
- 明确本次导入批次、最多 10 条的范围和回滚点；
- 取得用户对生产机会库写入的明确批准。

## 4. 复核命令

```bash
npm run typecheck
npm run ich:ds1c:audit-candidates
npm run ich:ds1d:release-dry-run
```
