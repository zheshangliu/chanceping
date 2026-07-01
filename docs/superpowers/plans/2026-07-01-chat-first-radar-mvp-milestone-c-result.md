# Chat-First Radar MVP Milestone C Result

日期：2026-07-01

## 本轮范围

本轮只执行 Milestone C：Search Run Audit and Raw Candidate Accounting。

已停止在 Milestone C，不继续执行 Milestone D/E/F，也未进入 V1.7。

## 已完成

1. `SearchOrchestratorResult` 增加搜索运行审计字段：
   - `searchPlan`
   - `executionLog`
   - `sourceCoverage`
   - `candidateAccounting`
   - `rawCandidates`

2. `/api/radars/:id/run` 透传审计字段，前端或后续报告流程可读取本次实际搜索计划、provider 调用日志、原始候选和数量账本。

3. `openedUrls` 保持反幻觉约束：
   - 当前没有真实打开网页或抓取页面内容时，返回空数组。
   - 不从搜索 snippet 或 URL 列表伪造“已打开/已核验官网”。

4. `CandidateAccounting` 统一统计口径：
   - `rawCount`
   - `deduplicatedCount`
   - `assessedCount`
   - `acceptedCount`
   - `rejectedCount`

5. 新增 `verify:chat-mvp:api`，覆盖真实 MVP API 主路径：
   - 生成乒乓球雷达画像
   - 保存自定义雷达
   - 激活雷达
   - 手动运行雷达
   - 检查机会卡片
   - 检查搜索审计字段
   - 检查 `openedUrls` 不伪造
   - 检查机会入库并绑定当前 `radarId`
   - 生成 Markdown 报告
   - 检查报告包含机会标题
   - 检查 `RadarRun.reportId` 回写
   - 重载后检查机会和报告仍可查询

6. `verify:all` 已加入安全的 chat MVP 检查：
   - `verify:chat-mvp:contract`
   - `verify:chat-mvp:api`

未加入 live API 验证。

## 修改文件

本轮 Milestone C 相关文件：

- `src/search/types.ts`
- `src/search/orchestrator.ts`
- `src/api/types.ts`
- `src/api/routes/radars.ts`
- `scripts/verify-chat-mvp-api.ts`
- `package.json`

## 验证结果

已运行并通过：

```bash
node --run typecheck
node --run verify:chat-mvp:api
node --run verify:chat-mvp:contract
node --run verify:v15:e2e
node --run verify:v16
node --run verify:mvp-ux
node --run verify:all
git diff --check
```

其中 `verify:chat-mvp:api` 结果：

```text
chat MVP API: 21 PASS / 0 FAIL
```

`verify:all` 退出码为 0。

## 浏览器验收路径

本地服务仍在：

```text
http://localhost:3000/
```

手动验收建议：

1. 打开首页。
2. 输入：`我是乒乓球选手，想盯未来30天内国内外可报名的乒乓球比赛，优先 ITTF、WTT、中国乒协官网，排除培训广告`
3. 点击“盯机会”。
4. 确认画像。
5. 看到机会卡片和报告摘要。
6. 展开完整 Markdown 报告。
7. 保存为长期雷达。
8. 进入“我的雷达”，打开该雷达详情。
9. 确认机会列表和报告仍可见。

开发者/API 验收补充：

1. 手动运行一个雷达。
2. 在 `/api/radars/:id/run` 响应中检查：
   - `searchPlan.queries.length > 0`
   - `executionLog.queryExecutions.length > 0`
   - `executionLog.openedUrls.length === 0`
   - `rawCandidates.length > 0`
   - `candidateAccounting.rawCount >= candidateAccounting.deduplicatedCount`

## 未完成

以下内容未在本轮执行：

- Milestone D：Opportunity Assessment and Customer Report
- Milestone E/F
- V1.7 来源透明产品化
- 反馈调优
- 雷达市场
- 团队协作
- live API 验证加入 `verify:all`

## 建议

建议 Jason 验收 Milestone C 后，再进入 Milestone D。
