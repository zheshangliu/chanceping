# Chat-First Radar MVP Milestone G Result

日期：2026-07-01

## 范围

本轮只完成 Milestone G：通用画像生成与“我的雷达”收口。

未进入 Milestone H，未执行 live API 搜索验证，也未实现 V1.7 来源透明完整链路、反馈调优、雷达市场、团队协作或付费体系。

## 通用画像生成

新增通用需求解释层 `src/agents/radar-requirement-interpreter.ts`：

1. mock 模式不再回退到固定 RPA 比赛画像。
2. 从用户原话提取主体、机会意图、地域、时间、排除条件、行动目的和报告要求。
3. 用户没有说明的字段保持为空，由澄清问题补齐，不用行业模板伪造完整画像。
4. live 模式继续使用 LLM 提取结构化需求；Prompt 明确要求保留用户原始身份、禁止映射到预置行业、禁止填充用户没有表达的信息。
5. 通用官网名称和 URL 可以继续进入 MVP-light Source Hints。

围棋路径：

```text
输入：我是围棋选手
身份：围棋选手
需求置信度：低于 60
追问：你主要想盯哪些围棋机会，例如公开赛、职业定段赛、奖金赛事、培训营、赞助合作，还是其他机会？
```

## 需求置信度

不再使用“AI 生成即 100%”。

每个维度的 reason 明确区分：

- `用户明确表达：...`
- `AI 推断：...`
- `信息缺失：...`

后端生成真实 `requirementConfidence` 和 `questionsToConfirm`。前端以后端置信度与问题为主；没有后端问题时才使用前端兜底。仍维持最多 2 轮、每轮 1 个问题，以及“先按默认理解继续”。

客户点击确认画像后，Spec 才写入 `confirmation_status.user_confirmed=true`。自定义雷达允许客户明确接受默认假设后继续生成报告，旧固定雷达仍保留原有高置信度门槛。

## 跨行业矩阵

自动 contract 已覆盖：

- 我是围棋选手
- 我们是研学文旅公司
- 我们帮客户做补贴申报
- 我们做活动布置
- 我们是婚庆公司
- 我们是员工福利公司
- 我是一名猎头顾问
- 我想找投标机会
- 我想找客户线索

验收规则包括主体保留、机会不明时追问、不得回退 RPA、不得映射 `ai_competition`。

## 我的雷达

1. 页面请求 `/api/radars?scope=mine`，只返回当前用户未归档的 custom 雷达。
2. 前端再次过滤 `isBuiltin !== true`。
3. 后端 3 个内置雷达继续保留，兼容 V1.5/V1.6，但不展示给普通客户。
4. 旧“AI 生成 / 分类创建”入口合并为“建立新雷达”，点击返回首页聊天输入。
5. 空状态显示“还没有保存长期雷达”，并提供“回首页建立雷达”。
6. 首页示例只用于即时体验，不保存、不占免费配额。

## 删除雷达

每张用户雷达卡片增加“删除雷达”：

1. 删除前显示二次确认。
2. 调用现有 `DELETE /api/radars/:id` 执行软删除。
3. 删除后立即从“我的雷达”消失。
4. 免费配额立即释放。
5. 历史机会、运行记录和报告继续归档保留。
6. 内置雷达仍由后端拒绝删除。

## 修改文件

Milestone G 直接修改或新增：

- `src/agents/radar-requirement-interpreter.ts`
- `src/agents/radar-generator.ts`
- `src/agents/radar-spec-compiler.ts`
- `src/agents/radar-report-generator.ts`
- `src/prompts/radar-generator-prompt.ts`
- `src/api/routes/radars.ts`
- `web/radar-profile.js`
- `web/radars.js`
- `web/watch-result.js`
- `web/index.html`
- `web/styles.css`
- `scripts/verify-chat-mvp-contract.ts`
- `scripts/verify-chat-mvp-api.ts`
- `scripts/verify-mvp-ux.ts`
- `scripts/verify-mvp-browser-smoke.ts`
- `scripts/verify-v1.5-e2e.ts`
- `scripts/verify-task-v1.5-04-ui.ts`
- `scripts/verify-task-v1.5-05-generator.ts`

## 测试结果

```text
node --run typecheck                 PASS
node --run verify:v15:e2e           PASS
node --run verify:chat-mvp:contract 58 PASS / 0 FAIL
node --run verify:chat-mvp:api      35 PASS / 0 FAIL
node --run verify:mvp-ux            63 PASS / 0 FAIL
node --run verify:mvp-browser       PASS
node --run verify:v15               PASS
node --run verify:v16               PASS
node --run verify:all               PASS
git diff --check                    PASS
```

浏览器 smoke 的等待逻辑也已修正：此前把箭头函数作为字符串传给 Puppeteer，条件并未真实执行；现在会等待详情页真实出现机会卡片和报告行。

## 手动验收路径

```text
首页
→ 输入“我是围棋选手”
→ 点击“盯机会”
→ 看到围棋机会自然追问
→ 补充未来30天、国内外、围棋公开赛/定段赛、官网和排除条件
→ 看到“围棋选手”画像和中国围棋协会官网
→ 确认，开始盯机会
→ 看到机会卡片和 Markdown 报告
→ 保存为长期雷达
→ 我的雷达只显示该用户雷达
→ 查看机会和报告
→ 返回后点击删除雷达
→ 二次确认
→ 页面进入空状态，配额从 1/3 恢复为 0/3
```

Codex 内置浏览器检查：页面非空、无框架错误层、控制台 0 个 warning/error，完整交互路径通过。

## 仍未解决

1. 本轮没有调用 `api.env` 验证真实 LLM 或真实搜索 Provider；这是明确的范围限制。
2. mock 通用语义兜底用于稳定演示和自动测试，理解能力仍不等同于真实 LLM。
3. 文件上传尚未真实解析并写入画像。
4. “再次盯机会”仍不会自动生成并绑定新 Markdown 报告。
5. 软删除暂时没有客户侧恢复入口。

## 是否建议进入 Milestone H

Milestone G 的代码、API、浏览器和 V1.5/V1.6 回归均已通过，建议 Jason 验收本结果后进入 Milestone H。

Milestone H 建议只处理“再次盯机会后自动生成并绑定新报告”，不要与文件解析或 live 搜索混在同一批执行。
