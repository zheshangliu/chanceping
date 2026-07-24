# Business Radar 数据生产线

本目录实现《100条首发真实机会数据建设任务书》中的 Sprint D0 基础设施。

## 数据边界

- `src/business/data/source-registry.v1.json` 保存 48 个来源的接入元数据；它不是机会数据。
- P2 来源只能发现候选，绝不能成为公开机会的 `officialUrl`。
- 公开机会仍由 `src/business/opportunities.recorded.json` 加载；候选、证据、审核状态在内部 sidecar 中处理。
- 不将未核验、过期、撤销、结果或纯新闻项目发布到当前机会流。

## 可运行命令

```bash
npx tsx scripts/verify-business-data-pipeline.ts
npx tsx scripts/verify-business-data-quality.ts
npx tsx scripts/business-source-healthcheck.ts --output artifacts/business-source-health.json
npx tsx scripts/collect-business-candidates.ts --priority=P0 --max-per-source=50
npx tsx scripts/fetch-business-candidate-details.ts --limit=30
npx tsx scripts/build-business-review-queue.ts data/business/review/review-queue.csv
```

默认健康检查只检查首批 15 个 P0 来源；加 `--all` 才检查全部来源。健康检查只验证入口可访问性，不能替代单条机会的原文、截止日期与资格核验。
