# Chat-First Radar MVP Milestone E + F Result

日期：2026-07-01

## 本轮范围

本轮按顺序执行 Milestone E，然后执行 Milestone F。

未执行 Task 5-8，未进入 V1.7，未接入 live API，未修改生产环境。

## Milestone E 已完成

1. 首页和画像确认入口补齐更自然的 MVP 表达：
   - 首页辅助文案说明可以直接说一段话、补充官网、排除条件或材料。
   - 附件按钮提示“文件会作为画像补充材料使用，不会直接当作机会结果。”
   - 画像确认卡仅在存在默认假设时展示“默认假设”。

2. 结果页机会卡补齐客户可见状态：
   - `opportunity_kind`
   - `evidence_status`
   - `action_status`
   - S/A/B/C 级别继续保留。

3. 来源检查状态兼容新旧口径：
   - `checked`
   - `no_results`
   - `failed`
   - `invalid_url`
   - `name_only`
   - `checked_with_results`
   - `checked_no_results`
   - `not_checked`

4. 一次性盯机会结果生成报告时，前端会把 `candidateAccounting` 一并传给报告接口。

5. 保存为长期雷达后：
   - 创建 custom 雷达。
   - 激活雷达。
   - 立即运行一次新雷达。
   - 生成绑定 `radar_id + run_id` 的 Markdown 报告。
   - 页面展示成功提示：`已保存为长期雷达。本次机会和报告已经绑定到我的雷达。`
   - 短暂停留后进入“我的雷达”。

6. “我的雷达”卡片改成客户语言：
   - `画像摘要`
   - `上次运行时间`
   - `上次运行状态`
   - `查看机会和报告`
   - `再次盯机会`
   - 不再在卡片上展示 Provider 调试字段。

7. 雷达详情页增加客户可读摘要：
   - `雷达画像摘要`
   - `搜索重点`
   - `已入库机会`
   - `运行历史`
   - `历史报告`

8. 前端详情页生成 custom 报告时不再把 custom 映射为 `ai_competition`。

9. 浏览器 smoke test 扩展到：
   - 保存后进入“我的雷达”。
   - 校验卡片包含“查看机会和报告 / 再次盯机会”。
   - 进入 custom 雷达详情。
   - 校验详情页包含画像、机会和报告区块。

## Milestone F 已完成

1. 确认 `verify:all` 聚合脚本只包含 mock-safe 验收。
2. `verify:all` 未加入 live API 测试。
3. `verify:all` 未加入 `verify:mvp-browser`，浏览器 smoke 仍作为单独显式命令运行。
4. 修正 `verify:all` 内部串联方式：
   - 从 `npm run ...` 改为 `node --run ...`
   - 解决当前本地执行环境没有 `npm` binary 时无法聚合运行的问题。

## 修改文件

本轮 E/F 相关文件：

- `package.json`
- `scripts/verify-mvp-browser-smoke.ts`
- `scripts/verify-mvp-ux.ts`
- `web/home.js`
- `web/index.html`
- `web/radar-profile.js`
- `web/radar-detail.js`
- `web/radars.js`
- `web/styles.css`
- `web/watch-result.js`

## 验证结果

本地环境没有直接暴露 `npm` 命令，因此使用等价的 Node 脚本运行器执行：

```bash
node --run typecheck
node --run verify:v15:e2e
node --run verify:v15
node --run verify:v16
node --run verify:mvp-ux
node --run verify:chat-mvp:contract
node --run verify:chat-mvp:api
node --run verify:mvp-browser
node --run verify:all
git diff --check
```

关键结果：

```text
typecheck: exit 0
verify:v15:e2e: 40 PASS / 0 FAIL; V1.3 43 PASS / 0 FAIL; Task 038 75 PASS / 0 FAIL; Task 022 73 PASS / 0 FAIL; Task 028 119 PASS / 0 FAIL
verify:v15: all subtasks PASS
verify:v16: all subtasks PASS
verify:mvp-ux: 56 PASS / 0 FAIL
verify:chat-mvp:contract: 17 PASS / 0 FAIL
verify:chat-mvp:api: 28 PASS / 0 FAIL
verify:mvp-browser: exit 0
verify:all: exit 0
git diff --check: exit 0
```

## 浏览器验收

自动浏览器 smoke test 已在隔离 mock 服务中跑完整路径：

```text
首页 → 输入乒乓球清晰需求 → 画像确认 → 确认 → 机会卡片 → 报告摘要 → 展开 Markdown → 保存长期雷达 → 我的雷达 → custom 雷达详情
```

Codex 内置浏览器在本地 `http://localhost:3000/` 额外抽检：

1. 首页能看到：
   - `告诉我你想盯什么机会`
   - `你可以直接说一段话，也可以补充官网、排除条件或项目材料。先看结果，觉得有用再保存为长期雷达。`
2. 输入清晰乒乓球需求后，能进入画像确认卡。
3. 画像确认卡包含 ITTF、WTT、中国乒协等指定信号源。
4. 确认后能看到机会卡片、报告摘要、保存长期雷达文案。
5. 机会卡片能看到类型、证据、行动状态。
6. “我的雷达”卡片能看到画像摘要、上次运行时间、上次运行状态、查看机会和报告、再次盯机会。
7. custom 雷达详情页能看到雷达画像摘要、搜索重点、已入库机会、运行历史、历史报告。

本地 3000 当前已有 3 个 custom 雷达，免费配额已满，因此未在该长期数据上强行删除旧雷达再保存；完整保存路径由 `verify:mvp-browser` 在隔离 mock 服务中覆盖。

## 仍未解决

1. 当前搜索仍是 mock 数据，尚未进入 live API 验证。
2. 附件仍只是画像补充提示，尚未实现真实文件解析和材料入画像。
3. “再次盯机会”只运行雷达，不会自动生成新 Markdown 报告；后续可以改成运行后提示生成报告或自动生成。
4. 详情页仍保留定时、编辑、归档等旧能力，已尽量降噪，但后续可做更完整的信息架构整理。
5. 本轮未做 V1.7 来源透明、反馈调优、雷达市场、团队协作。

## 建议

建议 Jason 验收 Milestone E + F 后，再决定是否进入下一阶段。下一阶段若继续产品化，优先处理“再次盯机会后自动生成新报告”和“附件真实解析入画像”。
