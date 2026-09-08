# 盯非遗｜赛事备忘录与中文展示本地验收记录

## 范围

- 执行主文档：`盯非遗_上轮验收修正与赛事备忘录中文展示_合并任务书_V1.1.md`
- 已打开并核对执行包 `references` 中的真实旧版 PDF、桌面截图、手机截图和卡片示例。
- 基线：`e5f64f73c0e37b0521166fd1a6d623dae25b6281`；当前分支：`rescue/mvp-codex`。
- 本轮未新增 Source、未重新抓取、未部署生产、未修改 DNS。

## 本轮完成

1. 管理后台写操作改为生产 fail-closed，浏览器写操作通过用户输入的凭据注入请求头；页面不再内置固定 token。
2. Source URL 校验补充 IPv4、IPv6、DNS 解析、多跳重定向和响应体大小保护；health ledger 按 `source_id` 合并写回。
3. 补齐来源地区与赛事所在地的独立使用、未来开始日期排除、分类/方向/作品形式筛选，并保持既有 V2 Source → Fetch → Dedup → Filter → Display 主链路。
4. 新增 `/ich/memo` 赛事备忘录：基于同一 V2 赛事池完整加载当前赛事，按截止时间排列；桌面表格、手机紧凑列表、打印样式均可用，不设置固定候选数上限。
5. 新增确定性中文展示缓存：当前海外外语机会 186 条均有中文标题和摘要，原始标题/来源原文仍保留；不增加评分或官方核验门槛。
6. 卡片与详情页保留来源、地点、范围、截止时间、分类和原文入口；缺失字段显示“待确认/待补充”，不伪造信息。

## 本地真实数据

本轮只重算中文缓存，没有重新抓取，因此机会池保持上一轮真实运行快照：

| 指标 | 结果 |
| --- | ---: |
| Sources | 30 |
| Opportunity Pool | 728 |
| 全量可浏览机会 | 146 |
| 赛事可浏览机会 | 101 |
| CN / GLOBAL | 125 / 21 |
| 外语机会中文缓存 | 186 / 186 |
| ACTIVE / FAILED / NEEDS_ADAPTER | 20 / 6 / 4 |
| Scheduler next run | `2026-09-11T02:07:57.799Z` |

上一轮实际抓取记录为 `26 attempted / 20 successful / 787 raw items / 728 pool items`；本轮未重复运行抓取命令，避免改变该快照。

## 本地页面与交互验收

- `/ich`：HTTP 200，默认赛事视图 101 条；保留旧版暖纸张、地图 Hero、双栏卡片和分页结构。
- `/ich/memo`：HTTP 200，完整加载 101 条赛事；桌面表格列宽可读，手机切换为紧凑列表。
- `/ich?q=LOEWE`：搜索结果可见，LOEWE 中文标题仅出现一次。
- 点击测试：主页 → 赛事备忘录、搜索、分页第 2 页、第一张卡片详情均成功。
- 负例检查：备忘录页面不出现 `blog / podcast / archive / mailto:`；KCDF Craft Culture、Homo Faber holiday season 不进入该页面。
- 中文展示：LOEWE、Craft Scotland、Heritage Crafts、ASEF 等缓存保留原文来源链接；LOEWE 详情摘要不再直接显示来源页导航噪声。

## 测试

通过：

- `npm run opportunity:v2:display`
- `npm run verify:ich:v11`
- `npm run verify:opportunity:v2`
- `npm run verify:ich:competition-module`
- `npm run verify:v15:e2e`
- `npm run verify:v15`
- `npm run verify:v16`
- headless Chromium 主页、搜索、分页、详情、备忘录点击及负例检查
- `git diff --check`

已知工作区问题（未纳入本轮）：`npm run typecheck` 和 `npm run verify:all` 被既有未跟踪 benchmark/headhunter 文件引用的缺失模块阻断；错误只涉及 `scripts/run-search-provider-benchmark.ts`、`scripts/verify-search-provider-benchmark.ts`、`src/benchmark/benchmark-runner.ts` 及其缺失依赖，未涉及本轮改动文件。本轮不触碰这些无关文件。

## 预览截图

截图均为本地 headless Chromium 实际请求 `127.0.0.1:3000` 生成，文件位于 `docs/ich/previews/v1.1/`：

- `home-desktop.png` / `home-mobile.png`
- `filtered-competition.png`
- `memo-desktop.png` / `memo-desktop-top.png`
- `memo-mobile.png` / `memo-mobile-top.png`
- `loewes-search.png` / `loewes-detail.png`
- `history-page-2.png`
- `admin-sources.png`

## 发布边界

- 仅提交本轮相关源代码、验证脚本、中文缓存、验收记录和预览截图。
- 不提交 benchmark、headhunter、其他未跟踪目录或运行时临时文件。
- 本轮生产部署：`NO`；DNS 修改：`NO`。
