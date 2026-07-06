# 盯比赛 · 全球 AI 赛事导航 Demo 样板间总规划

日期：2026-07-05  
适用项目：ChancePing / 盯机会  
适用分支：`rescue/mvp-codex`  
建议页面路径：`/ai-events`  
后续独立域名方向：`https://aievents.chanceping.com`

## 1. Demo 定位

本 Demo 是 ChancePing 第一个商业样板间。

对外展示名：

```text
盯机会 ChancePing · 盯比赛 · 全球 AI 赛事导航
```

页面展示建议：

- 母品牌 / Logo：`盯机会 ChancePing`
- Demo 子应用名：`盯比赛`
- 页面功能说明：`全球 AI 赛事导航`
- 英文名：`AI Contest Navigator`
- 英文归属说明：`Powered by ChancePing AI Opportunity Radar`

这个 Demo 的目的不是做一个普通赛事列表，而是证明 ChancePing 可以为一个垂直领域建立：

- 持续更新的数据源网络
- 多源采集和查漏补缺
- 官方来源核验
- 机会去重、分类、评分和归档
- 面向用户的机会卡展示页
- 可交付给 B 端客户的行业情报样板间

## 2. 关于栏目文案

中文版：

```text
盯比赛 · 全球 AI 赛事导航，是基于盯机会 ChancePing AI 机会雷达系统开发的公开 Demo。

它持续收集、校验和整理全球 AI 比赛、AI Hackathon、AIGC 创作赛、AI 视频/电影节、算法挑战和开发者竞赛，并以卡片形式展示正在报名、即将截止和历史赛事机会。

本页面用于展示 ChancePing 如何为一个垂直领域定制机会雷达：从多数据源采集、官方链接核验、机会分类，到持续更新和前端情报展示。
```

英文版：

```text
AI Contest Navigator is a public demo powered by the ChancePing AI Opportunity Radar system.

It continuously collects, verifies, and organizes global AI competitions, AI hackathons, AIGC creator contests, AI film and video festivals, ML challenges, and developer competitions.

This page demonstrates how ChancePing can build a customized opportunity radar for a vertical domain, from multi-source discovery and official-source verification to categorization, continuous updates, and intelligence-card presentation.
```

## 3. 总体架构

推荐链路：

```text
固定数据源抓取
  -> 聚合源查漏
  -> Serper 搜索补充
  -> 官方页面校验
  -> 去重合并
  -> 字段抽取
  -> 分类和状态判断
  -> ChanceScore / 推荐度
  -> 入库
  -> /ai-events 卡片展示
  -> 过期后进入历史库
```

核心原则：

- 固定数据源网络负责稳定覆盖。
- 聚合源负责扩大召回和对标。
- Serper 负责探索边界、发现新源、补字段、查漏补缺。
- 所有重要机会最终都要回到官方页面核验。
- 不把任何第三方聚合站直接当唯一事实来源。

## 4. 数据源网络

### 4.1 第一层：官方 / 主平台

这些平台优先作为高可信来源。总控台应优先接入可稳定访问、字段清晰、赛事数量足够的平台。

海外 AI Hackathon / Agent / Vibe Coding：

- Devpost AI
- Lablab AI Hackathons
- DoraHacks
- HackerEarth
- MLH
- Microsoft / GitHub / Google Cloud 等官方开发者挑战

海外算法赛 / 数据科学赛：

- Kaggle Competitions
- AIcrowd Challenges
- DrivenData Competitions
- Zindi Competitions
- EvalAI Challenges
- Codabench
- Grand Challenge

海外 AIGC / AI 视频 / AI 电影创作：

- Runway AI Film Festival
- Reply AI Film Festival
- Project Odyssey
- TapNow Challenge
- FilmFreeway 上的 AI film / AI short film 相关赛事
- 其他 AI 视频模型平台活动页，如 Runway、Pika、Kling、Vidu、PixVerse 等

国内算法赛 / 数据科学赛：

- 阿里云天池
- 百度 AI Studio
- DataFountain
- 科大讯飞 AI 开发者大赛
- 和鲸社区
- 飞桨 / PaddlePaddle 相关比赛
- 华为云 / 腾讯云 / 火山引擎等开发者挑战

国内 AIGC / AI 创作赛事：

- 即梦 / Dreamina
- TapNow 中文活动
- 抖音 / 剪映 / 火山引擎创作者活动
- 影视节 AIGC 单元
- 品牌 AIGC 创作赛
- 高校 AI 影像 / AI 艺术季

### 4.2 第二层：聚合 / 线索源

这些源用于扩大召回、发现漏网赛事、对标覆盖率。使用时必须回官方页面验证。

- CompeteHub：`https://www.competehub.dev/zh`
- ML Contests
- Papers with Code Competitions
- GitHub `awesome-ai-agent-hackathons`
- GitHub `awesome-ai-competitions` 类列表
- Coggle / CompHub / competition.coggle.club
- AI 赛事通等国内聚合站或小程序
- Datawhale competition-baseline

CompeteHub 特别说明：

- 适合作为 Q.7-G7 的强召回参考源。
- 可用于检查 ChancePing 是否漏掉算法赛、数据科学赛和综合竞赛。
- 不能直接作为唯一事实来源。
- 每条机会仍需 canonicalize 到官方报名页或官方活动页。

### 4.3 第三层：公众号 / 社群 / 微信源

第一阶段不作为自动化主源，后续接入微信源后再做。

可先进入候选清单：

- Kaggle 竞赛宝典
- Coggle 数据科学
- ChallengeHub
- DataFountain 官方号
- 阿里天池官方号
- 科大讯飞 A.I.开发者大赛官方号
- Datawhale
- 赛事官方微信群 / Discord / 小红书 / 知乎组队帖

边界：

- 公众号适合做资讯补充和人工 benchmark。
- 不建议在第一阶段依赖公众号抓取作为主链路。
- 后续如接入微信源，需要单独设计授权、抓取、去重和版权边界。

### 4.4 Serper 的角色

Serper 保留，但不再作为主力来源。

Serper 用于：

- 发现新的赛事源
- 查漏补缺
- 为已发现赛事寻找官方页
- 补充奖金、截止时间、封面图、参赛形式
- 对 Arenix / CompeteHub 等参考源做召回差异分析

Serper 不应单独承担：

- 每周全量 AI 赛事发现
- 稳定机会库的主要来源
- 官方状态的最终判断

## 5. 数据结构建议

每条赛事机会至少保存：

- `id`
- `title`
- `title_en`
- `official_url`
- `source_url`
- `source_name`
- `source_type`
- `organizer`
- `cover_image_url`
- `status`
- `deadline`
- `start_date`
- `end_date`
- `prize_summary`
- `benefit_summary`
- `entry_format`
- `location`
- `remote_ok`
- `audience`
- `categories`
- `tags`
- `evidence_summary`
- `verification_status`
- `chance_score`
- `first_seen_at`
- `last_checked_at`
- `expired_at`
- `language`
- `raw_source_snapshot_key`

状态建议：

- `open`：正在报名
- `closing_soon`：即将截止
- `upcoming`：即将开始
- `ongoing`：进行中
- `expired`：已截止 / 历史赛事
- `needs_review`：待复核

前端不直接展示 raw status，而展示中文 / 英文标签。

## 6. 分类体系

第一阶段：

- 先全部用卡片展示。
- 分类只作为标签，不强迫用户先理解分类。

第二阶段增加筛选：

- AI Agent / Vibe Coding
- AI Hackathon
- AIGC 视频 / AI 电影 / 短片创作
- AIGC 图像 / 音乐 / 多模态创作
- 算法赛 / 数据科学 / ML Challenge
- 云厂商开发者挑战
- 创业赛 / Grant / Demo Day
- 学生赛 / 高校赛
- 公益 / 政府 / 科研挑战
- 中国可参加
- 海外远程可参加
- 线下限定

中文前端标签建议：

- 正在报名
- 即将截止
- 官方入口
- 新增收录
- 海外远程
- 国内可参加
- 待复核
- 历史赛事

英文标签建议：

- Open
- Closing Soon
- Official Source
- Newly Added
- Remote Friendly
- China Eligible
- Needs Review
- Archived

## 7. 前端页面规划

页面路径：

```text
/ai-events
```

页面目标：

- 第一版就是一个可用、清晰、足够全的 AI 赛事导航页。
- 不做 S/A/B/C 等内部评级展示。
- 不把页面做成后台管理台。
- 对外展示的重点是“全、清晰、可验证、持续更新”。

首屏结构：

- Logo：盯机会 ChancePing
- 主标题：盯比赛 · 全球 AI 赛事导航
- 英文标题：AI Contest Navigator
- 简短说明：持续更新全球 AI 比赛、Hackathon、AIGC 创作赛和算法挑战
- 语言切换：中文 / EN
- 状态筛选：正在报名、即将截止、历史赛事
- 分类筛选：第一阶段可折叠或放到第二阶段

卡片网格：

- 桌面端一行 3-4 张。
- 普通宽度一行 2-3 张。
- 移动端一行 1 张。
- 一个机会就是一张独立卡片。
- 不再把多张机会卡包在一个大容器里。

机会卡字段：

- 封面图
- 标题
- 状态标签
- 分类标签
- 主办方 / 平台
- 截止时间
- 奖金 / 权益
- 参赛形式
- 适合人群
- 官方入口按钮
- 来源 / 最近校验时间

关于栏目：

- 放在页面底部或独立 `About` 区块。
- 明确写明本 Demo 基于 ChancePing AI 机会雷达系统开发。
- 说明这是用于展示垂直行业机会雷达定制能力的公开 Demo。

## 8. 双语规划

本 Demo 需要支持中英文切换。

第一阶段只做 `/ai-events` 页面双语，不扩展到整个主控台。

需要双语的内容：

- 页面标题
- 页面说明
- 导航
- 筛选项
- 按钮
- 关于文案
- 状态标签
- 分类标签
- 空状态 / 加载状态 / 错误提示

赛事标题处理：

- 保留原始标题。
- 可以增加 `summary_zh` / `summary_en`，但不强制第一阶段完成。
- 不要机器翻译后覆盖原始标题。

## 9. 与现有 Hero Demo 的关系

现有 AI 赛事雷达 Hero Demo 仍然保留在主控台左侧样板间。

关系如下：

```text
主控台 AI 赛事雷达
  -> 证明雷达如何被创建、确认、运行、生成报告

/ai-events 公开页
  -> 展示雷达长期运行后沉淀出来的数据产品
```

也就是说：

- 主控台是后台能力展示。
- `/ai-events` 是前台交付成果展示。
- 两者共同组成第一个完整商业 Demo。

## 10. 执行阶段

### Phase 0：当前总控台任务完成前

只允许做规划、数据源调研、字段设计。

不要并行改：

- 首页
- 雷达列表
- 机会卡 UI
- `/ai-events` 页面
- 数据结构核心字段

避免和总控台当前任务冲突。

### Phase 1：数据源网络一期

目标：

- 建立 source registry。
- 先接入 6-8 个高价值数据源。
- 跑出第一版 AI 赛事机会池。

建议首批源：

- CompeteHub
- Devpost AI
- Lablab AI Hackathons
- DoraHacks
- Kaggle
- AIcrowd
- DataFountain 或阿里天池
- Runway / Reply AI Film Festival / Project Odyssey 中至少一个

验收：

- 至少产出 30 条以上候选赛事。
- 至少 15 条能形成可展示机会卡。
- 每条展示卡必须有官方链接或明确 `待复核` 状态。
- 能区分正在报名和历史赛事。
- 能保存最近校验时间。

### Phase 2：字段抽取和官方核验

目标：

- 抽取标题、封面、截止时间、奖金、主办方、参赛形式。
- 对聚合源结果回官方页验证。
- 形成统一机会卡结构。

验收：

- 有图率可统计。
- 有截止时间比例可统计。
- 有奖金 / 权益比例可统计。
- 待复核原因可展示。

### Phase 3：`/ai-events` 前端页面

目标：

- 卡片式展示正在报名的 AI 赛事。
- 支持中英文切换。
- 支持状态筛选。
- 展示关于栏目。

验收：

- 页面能展示明显多于 Arenix 当前参考页的赛事卡。
- 卡片字段清晰，不暴露工程字段。
- 移动端可用。
- 中英文切换不出现半成品按钮。

### Phase 4：分类筛选和历史库

目标：

- 增加分类筛选。
- 增加历史赛事库。
- 展示新增、即将截止、已过期。

验收：

- 同一赛事不会重复出现多张卡。
- 已过期赛事自动进入历史库。
- 分类标签能稳定落到至少 6 个主分类。

### Phase 5：自动化持续更新

目标：

- 每日或每周自动运行。
- 记录新增、更新、过期赛事。
- 支持后续微信源接入。

验收：

- 自动运行后可看到新增 / 更新 / 过期统计。
- 失败源不影响其他源运行。
- 每个源有独立错误记录和最近成功时间。

## 11. 不做事项

当前不要做：

- 付费体系
- 雷达市场
- 团队协作
- 大规模 UI 重构
- 全站国际化
- 直接修改阿里云正式环境
- 直接把 Arenix / CompeteHub 当唯一生产数据源
- 未经核验就展示第三方聚合源字段为官方事实

## 12. 总控台执行建议

如果总控台当前仍在执行 AI 赛事 Hero Demo / 主控台 UI polish：

1. 先完成当前任务。
2. 再读取本文件作为下一阶段入口。
3. 不要两个任务同时修改同一批前端和数据结构文件。

如果必须提前启动本任务：

1. 只做 source registry 和数据源调研。
2. 不碰现有 UI。
3. 不改主控台 Hero Demo 链路。
4. 所有新数据结构先保持向后兼容。

## 13. 一期成功标准

一期完成后，Demo 应该能够证明：

- ChancePing 不只是搜索关键词，而是有自己的 AI 赛事数据源网络。
- 展示页赛事数量明显多于单一参考页。
- 海外远程比赛、AIGC 创作赛、AI Agent Hackathon、算法赛都有覆盖。
- 每张卡都有官方链接或明确待复核状态。
- 页面支持中文 / 英文。
- 已截止赛事进入历史库。
- 后续可以按客户行业复制这套数据源网络和展示页方法。
