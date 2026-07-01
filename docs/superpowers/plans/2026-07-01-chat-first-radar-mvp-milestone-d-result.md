# Chat-First Radar MVP Milestone D Result

日期：2026-07-01

## 本轮范围

本轮只执行 Milestone D：Opportunity Assessment and Customer Report。

已停止在 Milestone D，不继续执行 Milestone E/F，也未进入 V1.7。

## 已完成

1. OpportunityCard 增加 MVP 评估元数据：
   - `opportunity_kind`
   - `evidence_status`
   - `action_status`
   - `assessment`
   - `profileRevisionId`
   - `runId`

2. Search scoring 增加：
   - `gradeFromScore`
   - `evidenceStatusFromEvidence`
   - `opportunity_kind / evidence_status / action_status / score_basis`

3. OpportunityCard mapper 写入 `OpportunityAssessment`：
   - `kind`
   - `evidenceStatus`
   - `actionStatus`
   - `scoreItems`
   - `basis: "mixed"`
   - `scoringPolicyVersion: "mvp-2026-07-01"`

4. 证据状态遵守反幻觉约束：
   - 没有字段级证据 ID 时不标记 `confirmed`
   - 模型判断使用 `mixed`，不标为 `fact`

5. Markdown 报告改为新版公开骨架：
   - `# ChancePing｜本周机会雷达报告`
   - `## 1. 雷达画像`
   - `## 2. 本周一句话判断`
   - `## 3. S / A / B 级机会总览`
   - `## 4. 机会详情卡片`
   - `## 5. 本周行动清单`
   - `## 6. 不建议投入或需复核的机会`
   - `## 7. 来源与检查回执`
   - `## 8. 下周继续追踪`

6. 报告机会详情展示：
   - 级别
   - 机会类型
   - 证据状态
   - 行动状态
   - 为什么适合你
   - 截止时间
   - 建议动作
   - 官方来源
   - 风险提醒

7. 空结果报告增加可行动建议：
   - 放宽地区
   - 减少排除条件
   - 增加指定信号源
   - 保存为长期雷达继续监控

8. 报告统计只从 `CandidateAccounting` 读取。
   - 未传入时明确写“本轮未收到 CandidateAccounting，报告不编造候选统计。”

9. 浏览器 smoke 对报告第 7 节标题兼容新版 `来源与检查回执`。

## 修改文件

本轮 Milestone D 相关文件：

- `src/schema/opportunity-card.ts`
- `src/search/types.ts`
- `src/search/opportunity-scorer.ts`
- `src/search/opportunity-card-mapper.ts`
- `src/agents/radar-report-generator.ts`
- `src/api/types.ts`
- `src/api/routes/reports.ts`
- `scripts/verify-chat-mvp-api.ts`
- `scripts/verify-report-template.ts`
- `scripts/verify-mvp-browser-smoke.ts`

## 验证结果

已运行并通过：

```bash
node --run typecheck
node --run verify:report-template
node --run verify:chat-mvp:api
node --run verify:v15:e2e
node --run verify:v16
node --run verify:mvp-ux
node --run verify:mvp-browser
node --run verify:all
git diff --check
```

关键结果：

```text
verify:report-template: PASS report template matches MVP structure
verify:chat-mvp:api: 28 PASS / 0 FAIL
verify:mvp-ux: 47 PASS / 0 FAIL
verify:all: exit 0
```

## 浏览器验收路径

本地服务已重启到最新代码：

```text
http://localhost:3000/
```

手动验收建议：

1. 打开首页。
2. 输入：`我是乒乓球选手，想盯未来30天内国内外可报名的乒乓球比赛，优先 ITTF、WTT、中国乒协官网，排除培训广告`
3. 点击“盯机会”。
4. 确认画像。
5. 看到机会卡片。
6. 展开完整 Markdown 报告。
7. 确认报告包含：
   - `ChancePing｜本周机会雷达报告`
   - `机会类型`
   - `证据状态`
   - `行动状态`
   - `来源与检查回执`
   - `CandidateAccounting` 统计表
8. 保存为长期雷达。
9. 进入“我的雷达”查看本次机会和报告。

## 未完成

以下内容未在本轮执行：

- Milestone E：前端 Chat-First MVP Surface
- Milestone F：Full Safe Verification and Review Handoff
- V1.7 来源透明产品化
- 反馈调优
- 雷达市场
- 团队协作
- live API 验证加入 `verify:all`

## 建议

建议 Jason 验收 Milestone D 后，再进入 Milestone E。
