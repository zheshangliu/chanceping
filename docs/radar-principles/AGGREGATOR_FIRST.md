# ChancePing 机会雷达｜Aggregator-First 第一性原则 V1.0

> 核心原则：**先借成熟信息网络，再建设自己的情报能力。**
>
> 适用范围：ChancePing / 盯机会下所有新建与现有机会雷达，包括非遗机会雷达、全球赛事雷达、AI 创作赛事雷达、商业合作雷达、政策资金雷达，以及后续任何新增垂直雷达。

---

## 1. 为什么要采用 Aggregator-First

过去构建机会雷达时，容易直接进入：

```text
增加大量官方网站
→ 给每个网站写 Adapter
→ 自己逐站抓取
→ 自己从互联网里找机会
→ 再想办法把机会数量做大
```

这种路径的问题包括：

- 重复建设市场上已经成熟存在的信息聚合能力；
- Source Adapter 数量快速膨胀，维护成本高；
- 网站改版后容易失效；
- 搜索引擎从全网寻找机会时噪声较大；
- 容易被“机会总数”反向驱动，降低数据质量；
- 不同 Radar 容易重复抓取同一机会；
- 工程资源被消耗在“找信息”，而不是 ChancePing 真正有差异化价值的部分。

新的第一性原则是：

```text
先找成熟聚合平台
↓
用聚合平台批量发现候选
↓
ChancePing 做增量抓取
↓
按 Radar 用户画像筛选
↓
跨来源去重
↓
回溯主办方 / 采购方官方页面
↓
结构化事实与证据
↓
质量门禁
↓
正式发布
```

ChancePing 不需要重新成为“另一个赛事聚合网站”。

ChancePing 的核心价值应该是：

> **跨平台发现 + 用户画像筛选 + 官方核验 + 结构化决策 + 持续提醒。**

---

# 2. ChancePing 的新机会发现优先级

以后任何 Radar 都必须优先按照以下顺序寻找数据来源。

## Priority 1｜成熟聚合平台

首先寻找市场上已经长期运营、持续收集同类机会的平台。

例如：

### 国内设计 / 文创

- 设计竞赛网
- 创赛云
- 其他长期稳定赛事聚合站

### 海外设计 / 工艺

- Contest Watchers
- Crafts Council Opportunities
- ArtConnect
- 其他 Open Call / Competition / Residency 聚合平台

这些来源负责：

```text
Discovery
```

即“发现有这个机会”。

---

## Priority 2｜专业行业数据库 / Newsletter / RSS / API

如果行业已经存在：

- 专业数据库
- Newsletter
- RSS
- 公共 API
- 官方公开 JSON 接口
- 结构化赛事数据库

应优先使用这些来源。

优先顺序：

```text
公开 API / RSS
>
结构化 JSON
>
SSR HTML
>
稳定 DOM
>
Browser Rendering
```

原则：

> 能直接读结构化数据，就不要用浏览器模拟点击。

---

## Priority 3｜高价值官方固定来源

只有对非常重要、非常高价值的来源，才建立长期官方 Adapter。

例如：

- 国家级政府采购平台
- 国家 / 地方文化主管部门
- UNESCO
- 国家级非遗平台
- 重点博物馆
- 重点 Craft Organization
- 重点基金会
- 重点国际赛事官方站

官方来源的价值主要是：

```text
官方证据
+
重点机会补漏
+
长期专项监控
```

---

## Priority 4｜Search Engine

Serper、Bocha、Brave、Doubao 等搜索 Provider 主要用于：

### A. 官方回溯

例如：

```text
聚合站发现：
“2026 XX 非遗文创大赛”
↓
Serper / Bocha 搜：
“2026 XX 非遗文创大赛 官方”
↓
找到主办方官网
```

### B. 补漏

当成熟聚合平台没有覆盖某个机会类型时，再通过搜索引擎主动发现。

因此：

```text
Aggregator = 主发现引擎
Search Engine = 官方回溯 + 补漏
```

不能默认让 Search Engine 从整个互联网承担全部机会发现。

---

# 3. 聚合平台的角色边界

聚合平台通常属于：

```text
discovery_source
```

它负责告诉 ChancePing：

> “可能存在这样一个机会。”

但正式发布前，原则上必须完成：

```text
Aggregator
↓
Organizer / Buyer / Institution Official Page
↓
L1 Evidence
```

聚合平台不能因为内容完整、页面稳定、长期运营或数据量大，就自动成为正式事实来源。

---

# 4. 什么时候聚合站本身可以成为 L1

只有当该机会本身就是聚合平台或机构自己发布、自己主办时，才允许页面自身成为 L1。

例如：

```text
Crafts Council
↓
发布 Crafts Council 自己主办的 Open Call
```

此时：

```text
Organizer == Source Owner
```

可以成为 L1。

如果 Crafts Council 只是转发第三方机会，则仍需回溯第三方主办方。

---

# 5. 新 Radar 的标准启动流程

以后新建任何 Radar，都优先执行下面这套流程。

## Step 0｜定义 Radar 用户和机会目标

先回答：

```text
谁在用？
他们想找什么？
什么机会对他们真正有行动价值？
```

---

## Step 1｜Aggregator Landscape Scan

在写任何大量 Adapter 前，先搜索：

> 市面上有没有已经长期聚合这类机会的网站？

至少搜索：

```text
<领域> 比赛 聚合
<领域> 机会 平台
<领域> 征集 平台
<领域> 项目库
<领域> 数据库

<domain> opportunities
<domain> competitions
<domain> open calls
<domain> grants
<domain> tenders
<domain> marketplace
<domain> directory
```

输出：

```text
Aggregator Candidate List
```

---

## Step 2｜Aggregator 分级

每个候选平台按照以下指标评分：

| 指标 | 说明 |
|---|---|
| Opportunity Density | 单页 / 单站机会数量 |
| Update Frequency | 更新频率 |
| Historical Stability | 是否长期稳定运营 |
| Structured Data | 是否方便程序化获取 |
| Coverage | 是否覆盖目标用户 |
| Freshness | 是否包含当前机会 |
| Dedup Value | 是否能补充其他来源 |
| Official Backtrace | 是否容易回溯主办方 |
| Noise Rate | 非目标机会比例 |
| Access Stability | 是否存在登录 / CAPTCHA / 强反爬 |

然后划分：

```text
P0
P1
P2
BLOCKED
NOT_SUITABLE
```

### P0

满足：

- 长期稳定；
- 更新频繁；
- 机会密度高；
- 与 Radar 高相关；
- 可持续抓取。

### P1

价值较高，但行业范围较宽、噪声较高、更新频率一般或技术接入稍复杂。

---

## Step 3｜先接 P0，再扩来源

禁止一开始就接几十个来源。

推荐：

```text
先接 2–5 个 P0
↓
真实运行
↓
观察产出
↓
再决定是否补 P1
```

---

## Step 4｜建立 Incremental Discovery

聚合站第一次抓取建立 baseline。

以后定时任务只处理：

```text
NEW
UPDATED
```

不重复处理整个历史库。

建议记录：

```text
source_id
source_item_id
title
detail_url
deadline
first_seen_at
last_seen_at
content_hash
status
```

---

## Step 5｜便宜规则先筛选

先用关键词、分类、截止日期、地区和简单规则做第一层过滤。

不要让 LLM 去重新阅读几百条明显无关机会。

流程：

```text
Raw 500
↓
Rule Filter 80
↓
Semantic Filter 25
```

---

## Step 6｜AI / 语义筛选

只把规则筛选后的候选送入语义判断。

例如：

```text
CORE
ADJACENT
IRRELEVANT
```

不要因为某个机会属于“设计”就自动认为适合 Radar。

---

## Step 7｜跨来源去重

同一个机会可能同时出现在：

```text
Aggregator A
Aggregator B
Search Engine
官方平台
```

应该形成：

```text
One Opportunity
+
discovered_by_sources[]
```

而不是生成多条。

---

## Step 8｜Official Backtrace

这是 ChancePing 最重要的差异化能力之一。

每条高价值候选都尝试寻找：

```text
主办方官网
政府公告
官方报名页
采购方公告
官方赛事规则
```

状态：

```text
OFFICIAL_FOUND
OFFICIAL_NOT_FOUND
MULTIPLE_CONFLICTING
PENDING
```

---

## Step 9｜结构化 Opportunity

只有完成官方回溯后，才进入正式字段抽取：

```text
title
organizer
deadline
eligibility
application_url
fees
location
benefits
requirements
opportunity_direction
```

无法确认：

```text
null
unknown
partial
```

禁止猜。

---

## Step 10｜Quality Gate

正式发布继续走：

```text
Evidence
↓
Semantic Validation
↓
DS3
↓
DS14
↓
Formal Store
```

聚合站负责提高“发现效率”。

现有 DS3 / DS14 负责守住“发布质量”。

---

# 6. ChancePing 标准发现架构

```text
                ┌────────────────────┐
                │ Aggregation Sources │
                └─────────┬──────────┘
                          │
                    Incremental Diff
                          │
                     Relevance Filter
                          │
                        Dedup
                          │
                 Official Backtrace
                    ↙             ↘
              Serper / Bocha    Direct Links
                    \             /
                      L1 Evidence
                          │
                  Semantic Validation
                          │
                        DS3
                          │
                        DS14
                          │
                    Formal Store
                          │
                    ChancePing UI
```

---

# 7. 官方 Source Adapter 什么时候建设

满足以下情况之一再建设：

1. 高价值官方来源；
2. 聚合平台覆盖不到；
3. 官方来源比聚合站更快；
4. 官方来源长期持续产生大量机会；
5. 需要非常高的时效性。

除此之外：

> 优先让聚合平台帮我们完成初步发现。

---

# 8. Search Provider 的正确定位

### Serper

主要：

- Google 全网官方回溯；
- 海外补漏。

### Bocha

主要：

- 中文互联网官方回溯；
- 国内机会补漏。

### Brave / Doubao

主要：

- fallback；
- 搜索覆盖补充。

以后不再用“是否接了更多搜索 API”衡量 Radar 成熟度。

而是看：

```text
Aggregator Coverage
+
Official Backtrace Success
+
Qualified Opportunity Yield
```

---

# 9. 以后不再用“机会总数量”驱动开发

例如：

```text
必须达到 80 条
```

只能作为阶段参考。

不能为了完成数字：

- 降低 L1 标准；
- 引入弱相关机会；
- 引入重复机会；
- 引入过期机会；
- 引入方向错误的商业机会。

真正 KPI 应改为：

```text
raw_items_seen
new_items
relevant_candidates
deduplicated_candidates
official_backtrace_success
qualified_candidates
published_candidates
```

以及：

```text
official_backtrace_rate
candidate_to_publish_rate
duplicate_rate
error_rate
freshness
```

---

# 10. 每个 Aggregator 都应该有贡献统计

例如：

```text
shejijingsai

items_seen = 320
new = 18
relevant = 8
official_found = 6
qualified = 5
published = 4
```

这样才能知道哪个来源真的值得长期维护。

---

# 11. Source ROI

未来可计算：

```text
Source ROI
=
Published Qualified Opportunities
/
Maintenance Cost
```

如果某个网站 Adapter 很复杂、经常失败、每月只产生少量弱机会，应降级甚至移除。

---

# 12. 新 Radar 启动必须先回答的 10 个问题

以后任何新 Radar 开始前，必须先回答：

1. 这个 Radar 的用户是谁？
2. 用户真正想得到什么机会？
3. 市面上是否已有成熟聚合平台？
4. 国内最好的 3–5 个聚合源是什么？
5. 海外最好的 3–5 个聚合源是什么？
6. 有没有 API / RSS / Newsletter / Database？
7. 哪些官方源值得专项监控？
8. Serper / Bocha 只需要负责哪些补漏？
9. 官方回溯如何完成？
10. 哪些指标证明 Radar 真的有效？

如果第 3–6 项还没调查：

> 不应该直接开始大规模写 Adapter。

---

# 13. 新 Radar 的 Codex 启动指令模板

以后新建 Radar 时，可以直接给 Codex：

```markdown
你现在要为 ChancePing 新建一个【XXX机会雷达】。

开始写大量 Adapter、Crawler 或扩充机会数量之前，
必须先遵守：

《ChancePing 机会雷达｜Aggregator-First 第一性原则 V1.0》

本轮先执行 Aggregator Landscape Scan。

目标：

1. 明确目标用户和机会类型；
2. 搜索国内成熟聚合平台；
3. 搜索海外成熟聚合平台；
4. 搜索公开 API / RSS / Newsletter / Database；
5. 对候选来源做 P0/P1/P2 分级；
6. 判断技术可抓取性；
7. 找出最适合先接入的 2–5 个 P0；
8. 设计官方回溯方案；
9. 明确 Search Provider 只承担官方回溯和补漏；
10. 输出来源矩阵与推荐架构。

本阶段禁止：

- 为了数量目标批量新增机会；
- 一开始建立几十个官方 Adapter；
- 把聚合页直接当正式 L1；
- 默认 Serper 是主发现方式；
- 未验证市场已有聚合平台就自行重复造轮子。

完成 Aggregator Landscape Scan 后再进入实现。
```

---

# 14. ChatGPT 新 Radar 启动指令模板

以后你也可以直接对 ChatGPT 说：

```text
我要新建一个【XXX机会雷达】。

请按照 ChancePing 的 Aggregator-First 第一性原则执行。

第一步先不要做网站、不要增加大量官方 Source、
不要追求机会数量。

先帮我调查：

1. 国内有没有成熟的机会聚合平台；
2. 海外有没有成熟的机会聚合平台；
3. 有没有 API / RSS / Newsletter / Database；
4. 哪几个最适合做 P0 数据源；
5. 它们是否可以稳定增量抓取；
6. 如何回溯官方来源；
7. 哪些缺口才需要 Serper / Bocha 或自建官方 Adapter。

先输出 Aggregator Landscape Scan，
等确认来源结构后再设计 Radar。
```

---

# 15. 是否每次都需要重新上传这份 Markdown？

## 结论：不需要每次重新上传，但要让执行环境明确“必须遵守它”。

### 对 Codex

最佳方式：

把本文件长期放进 ChancePing Git 仓库，例如：

```text
docs/radar-principles/AGGREGATOR_FIRST.md
```

然后在：

```text
AGENTS.md
```

增加：

```markdown
## ChancePing Radar Development Rule

任何新建或扩展机会雷达，在设计 Source Registry、
Adapter、Crawler、Search Provider 或机会扩容之前，
必须先阅读并遵守：

docs/radar-principles/AGGREGATOR_FIRST.md

默认执行顺序：

Aggregator Landscape Scan
→ P0 Aggregator Integration
→ Incremental Discovery
→ Official Backtrace
→ Quality Gate
→ Official Source Gap Filling

禁止在未完成 Aggregator Landscape Scan 的情况下，
直接以“增加来源数量”或“增加机会数量”为主要开发目标。
```

这样 Codex 进入这个仓库后，就会有一个固定工程约束。

---

### 对 ChatGPT

如果一直在同一个 ChancePing 项目 / 工作区里：

可以把本文件作为项目长期资料保存。

以后只需要说：

```text
按 ChancePing Aggregator-First 原则新建 XXX 雷达。
```

就可以。

如果新开的是完全独立项目、独立聊天、没有共享当前项目上下文：

最稳妥的方式是：

- 上传这份 Markdown；
- 或把它加入该项目的知识文件；
- 或至少粘贴上面的“ChatGPT 新 Radar 启动指令模板”。

---

# 16. 推荐的最终工程治理方式

建议仓库形成：

```text
AGENTS.md
    ↓
引用
docs/radar-principles/AGGREGATOR_FIRST.md
    ↓
所有 Radar
```

例如：

```text
docs/radar-principles/
├── AGGREGATOR_FIRST.md
├── SOURCE_EVIDENCE_POLICY.md
├── OPPORTUNITY_DIRECTION.md
└── RADAR_METRICS.md
```

以后所有 Radar 共用。

---

# 17. 新 Radar 标准生命周期

```text
01 用户与机会定义
↓
02 Aggregator Landscape Scan
↓
03 P0 数据源选择
↓
04 技术可抓取性验证
↓
05 Incremental Adapter
↓
06 Relevance Filter
↓
07 Cross-source Dedup
↓
08 Official Backtrace
↓
09 Evidence Extraction
↓
10 Semantic Validation
↓
11 DS3
↓
12 DS14
↓
13 Scheduler
↓
14 Provider / Source Contribution Metrics
↓
15 Production
```

---

# 18. 核心禁止事项

以后 ChancePing Radar 开发默认禁止：

### 禁止 1

先定：

```text
必须增加到 80 / 100 / 500 条
```

再倒逼找机会。

### 禁止 2

市场上已有成熟聚合平台时，仍然从零建立大量低产官方 Adapter。

### 禁止 3

将聚合平台直接当正式事实来源。

### 禁止 4

将 Serper / Bocha 当作所有 Radar 的唯一发现引擎。

### 禁止 5

不同 Radar 重复抓同一个机会并生成多份数据。

### 禁止 6

为了 Source 数量扩大 Registry，而不验证：

```text
Candidate Yield
Qualified Yield
Publish Yield
```

---

# 19. 一句话判断有没有“重复造轮子”

每次准备开发一个新数据源前，先问：

> **有没有一个长期稳定的平台，已经在帮我们收集这类信息？**

如果答案是“有”，下一问应该是：

> **我们能不能把它当 Discovery Layer，然后把工程精力放到筛选、官方核验和用户决策上？**

只有答案是否定的，才进入大规模自建采集。

---

# 20. ChancePing 的真正护城河

ChancePing 的护城河不应是：

> “我们爬的网站比别人多。”

更应该是：

```text
更多成熟来源的统一接入
+
针对用户身份的精准筛选
+
官方证据回溯
+
机会方向理解
+
行动资格判断
+
截止提醒
+
跨 Radar 去重
+
长期机会情报积累
```

最终用户看到的不应该只是：

> “这里有很多机会。”

而应该是：

> **“这些是与你真正相关、经过核验、现在还能行动的机会。”**

---

# 21. 最终冻结原则

ChancePing 后续所有机会雷达默认遵守：

## Aggregator-First

```text
先找成熟聚合源
再建设抓取
```

## Evidence-First

```text
聚合负责发现
官方负责证明
```

## Incremental-First

```text
只处理新增与变化
不重复分析历史
```

## User-Fit-First

```text
不是机会越多越好
而是用户能行动的机会越多越好
```

## Reuse-First

```text
同一机会跨 Radar 复用
不重复抓取与重复存储
```

## Search-as-Support

```text
Serper / Bocha
负责官方回溯和补漏
不默认承担全部发现
```

---

# 22. 以后启动一个新 Radar，只需一句话

如果当前项目已经保存本原则：

```text
按 ChancePing Aggregator-First 第一性原则，
启动【XXX机会雷达】，
先执行 Aggregator Landscape Scan。
```

这句话应成为 ChancePing 新 Radar 的标准启动命令。
