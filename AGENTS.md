# AGENTS.md

## 项目定位

ChancePing / 盯机会 是 AI 机会雷达系统。用户告诉 AI 自己想盯什么机会，系统持续搜索、筛选、判断、评分、入库和生成报告。

当前优先级不是扩展功能，而是先完成 MVP 主链路。

## 当前最高优先级

最高优先级：

1. 自定义雷达 MVP 能真实跑通。
2. 不破坏 V1.5 / V1.6 已有功能。
3. 测试必须证明真实产品路径，而不是字段存在。
4. 所有改动必须可测试、可回滚。

## 当前不要做

不要做：

- V1.7 来源透明
- V1.7 反馈调优
- 雷达市场
- 团队协作
- 付费体系
- 大规模 UI 重构
- 直接修改 main
- 直接修改阿里云正式环境

## MVP 验收路径

必须验证：

1. 创建或 AI 生成自定义雷达
2. 保存雷达
3. 激活雷达
4. 手动运行雷达
5. 返回 `opportunityCards`
6. 机会入库并包含当前 `radarId` / `radarIds`
7. 雷达详情页能看到机会卡片
8. 生成 Markdown 报告
9. 报告绑定 `radar_id + run_id`
10. `RadarRun.reportId` 回写成功
11. 页面刷新后数据仍在

## 必跑命令

每次修改后至少运行：

```bash
npm run typecheck
npm run verify:v15:e2e
```

如果存在，也要运行：

```bash
npm run verify:v15
npm run verify:v16
npm run verify:all
```

如果 `verify:v16` 或 `verify:all` 不存在，请先补齐。

## 测试要求

E2E 不能只检查字段存在。

必须尽量检查：

```text
opportunityCards.length > 0
机会库 entries.length > 0
entry.radarIds includes radarId
报告 Markdown 包含至少一个机会标题
run.reportId === reportId
```

## 分支规则

不要直接修改 main。

当前使用：

```bash
git checkout -b rescue/mvp-codex
```

## 提交前输出

完成后输出：

1. 修改文件列表
2. git diff 摘要
3. 测试命令和结果
4. 真实网页验收步骤
5. 仍未解决的问题
6. 是否建议合并 main
