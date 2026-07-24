# Business Radar 数据回滚

1. 发布前保存当前 `src/business/opportunities.recorded.json` 的带时间戳副本。
2. 先运行数据校验和现有 Business Sprint 2 验收，再原子替换当前数据。
3. 若发布后发现过期、撤销或错误事实，立刻从当前数据移除该记录并写入历史归档；不要删除证据和审核记录。
4. 若批次整体异常，恢复最近一次通过验收的快照，重新运行 `npx tsx scripts/verify-business-sprint2.ts`。
5. 不在未完成全量验收时推送或部署生产环境。
