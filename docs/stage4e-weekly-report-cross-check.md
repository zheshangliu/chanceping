# Stage 4E｜下载周报跨雷达交叉审计

## 审计范围

本次审计读取了本机下载目录中的两份周报，并与仓库当前 ICH 正式机会库、AI Events 记录和 Stage 4E 已登记的跨雷达资产进行只读比对：

- `/Users/1sunflower/Downloads/全球高含金量赛事自动化监控系统_执行报告_2026W36_20260831.md`
- `/Users/1sunflower/Downloads/AI创作赛事雷达Agent_本周雷达_2026-08-31.md`
- `data/ich-opportunities.json`（当前 124 条）
- `src/demo/ai-events.recorded.json`
- `data/q5-r-live/radars.json` 与 `data/q5-r-live/opportunity-store.json`

周报本身是外部线索报告，不等同于 L1 官方证据。以下“缺失”表示在正式 ICH 库中没有找到可对应的已发布记录，不表示可以直接发布；仍须回到官方详情页完成 DS3/DS14 审核。

## 结论

1. 全球赛事周报列出的当前/观察机会中，6 条已经在 ICH 正式库中，4 条未找到对应记录，6 条已过期或被周报明确淘汰。
2. AI 周报中，2 条与非遗/传统文化直接相关但尚未进入 ICH：
   - 第八届“讲好中国故事”AI 创作主题赛；
   - 两岸（青岛）青年 AI 作品创作大赛。
3. AI 周报中的腾讯 AI 游戏、AWS、Google Agentic、千问办公、AI 影视、即梦、PixLight、中国创新影像等，当前没有足够的非遗/传统工艺行动信号，暂不自动迁移到 ICH；这是分类边界，不是漏抓。
4. 发现正式库已有记录的字段串写风险：LOEWE 2027、iF 2027、中华设计奖等记录复用了 DIA 的申请步骤或奖项字段。此问题必须先修复，再把这些记录作为跨雷达资产继续复用。

## A. 全球赛事周报逐条核对

| 周报机会 | 周报官方/主来源 | ICH 当前状态 | 处理结论 |
|---|---|---|---|
| 2026第九届金茶花国际文创设计大赛 | `https://www.ynxc.gov.cn/html/2026/gongzuodongtai_0320/3032954.html` | `active`, 已发布；同 URL | 已覆盖 |
| 重庆好礼·重庆中国三峡博物馆第二届“渝礼相遇” | `https://www.cq.gov.cn/ywdt/bmts/202606/t20260625_15777333.html`；报名页 `https://3gmuseum.yoois.com/wcds2026/page/index` | 未找到 | 进入官方详情页核验队列，不直接导入 |
| 2026 Gyeongnam K-Design Award | `https://gnk-designaward.net/eng/guidelines/guidelines.html` | 未找到 | 高优先级官方核验候选 |
| “粤韵新彩 共创美好”第十一届广东省非遗创意设计大赛 | 周报列出越秀文旅栏目页；正式库已有同标题记录，来源为 `https://www.yuexiu.gov.cn/yxdt/tzgg/content/post_10839528.html` | `active`, 已发布 | 已覆盖；周报栏目页作为可能的第二官方证据，未自动添加 |
| LOEWE FOUNDATION Craft Prize 2027 | `https://craftprize.loewe.com/zh/craftprize2027` | `closing_soon`, 已发布；同 URL | 已覆盖，但字段质量阻断复用 |
| 2026中国设计智造大奖（DIA）追加报名 | `https://www.di-award.org/zh/rules.html` | `closing_soon`, 已发布 | 已覆盖；收费与实物义务仍需按周报复核 |
| 2026中华设计奖常设赛道 | `https://www.cidip.cn/cda2026/permanent.html` | `closing_soon`, 已发布；同 URL | 已覆盖，但字段质量需复核 |
| 2026北京文博创意设计大赛 | `https://wwj.beijing.gov.cn/bjww/362679/362680/482911/744087330/index.html` | 未找到 | 仅观察信号；缺截止日期、入口和完整规则，不可发布 |
| iF DESIGN AWARD 2027 | `https://ifdesign.com/en/if-design-award-page-new` / FAQ | `closing_soon`, 已发布 | 已覆盖；周报判定为收费风险淘汰，需产品规则复核 |
| Red Dot Product Design 2027 | `https://www.red-dot.org/pd/dates-fees` | 未找到 | 观察，不因周报时间表直接发布 |

周报明确列为已截止/不适配的 GOOD DESIGN、 日本传统工艺展、林芝礼物、黑龙江礼物、福建礼物、UNESCO Asia-Pacific Heritage Awards、日本本土补贴等，不进入当前机会库补齐任务。

## B. AI 周报跨入 ICH 的边界判断

| AI 周报机会 | 文化/非遗信号 | 当前 ICH 状态 | 结论 |
|---|---|---|---|
| 第八届“讲好中国故事”AI 创作主题赛 | 明确包含“非遗新生”、AI 交互应用/H5 | 未找到 | 纳入 ICH 候选；必须补官方赛事页、报名入口、届次和截止日期 |
| 两岸（青岛）青年 AI 作品创作大赛 | 明确包含中华传统文化/非遗、文旅方向 | 未找到 | 纳入 ICH 候选；当前周报来源为设计赛事聚合页，必须回溯主办方官方规则 |
| AI 东方·京东 AI 影视创作大赛 | 文化/影视，但无明确非遗或传统工艺行动信号 | 未找到 | 保留 AI Events；暂不迁移 ICH |
| 腾讯游戏创作大赛·AI 游戏赛道 | AI 原生游戏、叙事和 NPC | 未找到 | 保留 AI Events；除非出现非遗/博物馆主题，不迁移 |
| AWS Agents、Google All Things Agentic、千问办公 | Agent/企业生产力 | 未找到 | 不属于 ICH |
| 即梦、PixLight、中国创新影像 | AI 影像/工具创作 | 未找到 | 保留 AI Events；不自动迁移 |

当前 AI Events 的 5 条录制演示数据均为通用 AI 事件，没有文化/非遗字段；因此不能把它们误报为已覆盖周报机会。

## C. 已发现的正式库字段风险

以下问题来自正式库现有 JSON 的直接字段比对，属于 P1 数据完整性问题，不是周报推断：

### 1. LOEWE 2027（P1）

- 周报官方规则：面向 18 岁以上专业工艺艺术家个人或创作团队，不接受商业公司直接报名；正式库却包含 `enterprise`、`organization`、`school`。
- 周报最高奖为 `€50,000`；正式库写成 `1,000,000 CNY`。
- 正式库申请步骤写成“登录 DIA 报名系统”“选择 DIA 文化创新类别”，明显是跨记录串写。
- 截止文字为欧洲中部时间，但正式库 `timezone` 为 `Asia/Shanghai`，不能继续用于排序或提醒。

### 2. iF 2027、中华设计奖（P1）

两条记录也复用了“登录 DIA 报名系统”等步骤；应分别回到各自官方报名入口重建步骤和资格字段。iF 还涉及强制 Jury/Winner Fee，正式库的发布策略需与周报的收费淘汰规则重新对齐。

### 3. 统一时间与金额规则（P1）

周报明确区分“官方确认”和“待核实”，正式库不能把未知奖金、时区、报名方式填成确定值。后续修复应保留官方原文和 `未确认` 状态，不按周报估算值覆盖官方字段。

## D. 推荐处置顺序

### P0：先修复后复用

1. LOEWE 2027：纠正主体、奖金、时区、报名步骤和权益字段。
2. 复核 iF 2027、中华设计奖及 DIA 的共用步骤是否由模板误写。

### P1：建立官方详情候选包

按官方来源逐条建立 DS1-D 审核包，优先顺序：

1. 重庆“渝礼相遇”；
2. Gyeongnam K-Design Award；
3. “讲好中国故事”AI 创作主题赛；
4. 两岸（青岛）青年 AI 作品创作大赛；
5. 北京文博创意设计大赛（仅在取得截止日和报名入口后）。

### P2：观察与规则边界

Red Dot 2027、AI 东方等保留在原雷达观察，不用“文化”宽泛标签强行迁移到 ICH。

## 本轮未执行的动作

- 未修改 `data/ich-opportunities.json`；
- 未修改 AI Events 或 Global Competition 正式数据；
- 未执行候选导入、DS14 导入、部署或 DNS 变更；
- 未把周报二手来源直接当作 L1 官方证据。

本报告只记录下载周报与仓库资产的交叉审计结果。下一步若进入数据补齐，必须对上述候选逐条回溯官方详情页后再受控导入。
