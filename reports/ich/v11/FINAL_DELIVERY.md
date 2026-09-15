# 盯非遗｜综合机会覆盖 V1.1 最终交付

状态：SHIPPED_WITH_BACKLOG

## 1. 现在实际能用什么

本分支新增 /ich/opportunities 综合机会工作台预览、/api/opportunity-v2/workbench/coverage 共享 API，以及 CSV/Markdown 导出入口；复用采购工作台已有的跟进、变更摘要和共享机会身份。以当前独立 worktree 运行，**NOT_DEPLOYED**，没有把 localhost 或离线快照冒充生产入口。

演示路径：打开 /ich/opportunities → 按非比赛类型/分区筛选 → 查看正文证据、费用、钱的方向和资格缺口 → 通过既有跟进/导出路径继续处理。

## 2. 当前包承接结果

上一包采购工作台交付 SHA：fb3a6edcac2dbee826ea6bb13d70a01374961397；生产 M0 业务 SHA：f514ee6b624dc2bb5abf12bb317cb30c37bedb5d。本轮复用来源注册表、OpportunityV2 身份、跟进 sidecar、变更摘要、CSV/Markdown 导出和既有调度/发布流程；没有重复五源上线，也没有修改生产。上一包 strict LOEWE once backlog、历史 baseline partial/unrecoverable 和外部来源阻塞继续如实保留。

## 3. 六类覆盖

- 当前 snapshot Opportunity Pool：2098
- 综合机会 assessment：176（去重仍按 opportunity_id）
- 分区：current 125 · research 13 · review 38
- grant_funding：12 条（assessment 可多标签重叠）
- exhibition_showcase：125 条（assessment 可多标签重叠）
- market_channel：103 条（assessment 可多标签重叠）
- residency_learning：11 条（assessment 可多标签重叠）
- partnership_commission：6 条（assessment 可多标签重叠）
- recognition_incubation：0 条（assessment 可多标签重叠）

分类规则要求正文行动证据；同一机会可有多个 view type，但只有一个稳定身份。没有足够证据的记录进入 review/research，不把 open call 自动当比赛或资助，不把费用当奖金，不把可能合作写成保证订单。

## 4. 值得研究的真实机会（最多10条）

- 1. 2026第十届中国戏曲文化周“戏曲+AI创意征集展示”高校作品征集公告｜exhibition_showcase、market_channel｜创赛云｜2026-09-15T23:59:00.000Z｜https://www.shejijingsai.com/2026/08/1621582.html
- 2. 2026中国美术家协会“为中国而设计”第十二届环境艺术设计展览征稿通知｜exhibition_showcase、market_channel｜创赛云｜2026-09-15T23:59:00.000Z｜https://www.shejijingsai.com/2026/07/1613915.html
- 3. 安庆市宜秀区形象标识（LOGO）征集公告｜exhibition_showcase、market_channel｜创赛云｜2026-09-15T23:59:00.000Z｜https://www.shejijingsai.com/2026/08/1627053.html
- 4. 青海林业和草原局 青海林草IP形象征集启事｜exhibition_showcase、market_channel｜设计竞赛网｜2026-09-15T23:59:00.000Z｜https://www.shejijingsai.com/2026/08/1627075.html
- 5. 2026第四届中国（吉林）动漫大会优秀动漫作品推介活动征集通知｜exhibition_showcase、market_channel｜设计竞赛网｜2026-09-20T23:59:00.000Z｜https://www.shejijingsai.com/2026/08/1627333.html
- 6. 2026景德镇城市礼物征集公告｜exhibition_showcase、market_channel｜设计竞赛网｜2026-09-20T23:59:00.000Z｜https://www.shejijingsai.com/2026/08/1619022.html
- 7. “文藏徽州”公共品牌VI设计征集公告｜exhibition_showcase、market_channel｜设计竞赛网｜2026-09-27T23:59:00.000Z｜https://www.shejijingsai.com/2026/08/1627059.html
- 8. “雪域赤橙 文创蓝焰”文创作品征集活动｜exhibition_showcase、market_channel｜CFW设计大赛｜文创IP｜2026-09-30T23:59:00.000Z｜https://dasai.cfw.cn/ds/1262.html
- 9. “印象中国”2026短视频征集展示活动作品征集｜exhibition_showcase、market_channel｜设计竞赛网｜2026-09-30T23:59:00.000Z｜https://www.shejijingsai.com/2026/06/1600758.html
- 10. 2026 第五届北京天文馆 “聚星杯”天文创意产品征集活动｜exhibition_showcase、market_channel｜设计竞赛网｜2026-09-30T23:59:00.000Z｜https://www.shejijingsai.com/2026/05/1551048.html

## 5. 来源贡献和取舍

- on-the-move-open-calls｜On the Move Open Calls｜on-the-move.org｜池内 2｜当前/提前 0｜NEEDS_ADAPTER/历史池记录，未宣称 live
- curatorspace-opportunities｜CuratorSpace Opportunities｜www.curatorspace.com｜池内 21｜当前/提前 5｜复用存量快照
- american-craft-council-opportunities｜American Craft Council Opportunities Board｜craftcouncil.org｜池内 47｜当前/提前 1｜复用存量快照
- craft-scotland-opportunities｜Craft Scotland｜www.craftscotland.org｜池内 19｜当前/提前 4｜复用存量快照
- artconnect-opportunities｜ArtConnect｜www.artconnect.com｜池内 28｜当前/提前 2｜复用存量快照
- kcdf-opportunities｜KCDF 한국공예·디자인문화진흥원｜www.kcdf.or.kr｜池内 10｜当前/提前 0｜复用存量快照
- cnaf-guides｜国家艺术基金申报指南｜www.cnaf.cn｜池内 0｜当前/提前 0｜PIPELINE_VERIFIED（官方申报指南，隔离解析6条）
- een-partnering｜EEN合作机会｜een.ec.europa.eu｜池内 0｜当前/提前 0｜WEB_OBSERVED（当前页目标行业正例0，保留观察）

实时有界读取：CNAF 官方指南 HTTP 200、解析 6 条，状态 PIPELINE_VERIFIED；EEN 官方目录 HTTP 200，但当前页目标行业过滤后 0 条，状态 WEB_OBSERVED，不写成生产接通。其余来源只按本地 runtime 快照/health 记录报告，未访问的不写 LIVE。完整 33 条 persisted registry、44 条 effective defaults 和来源 family 去重在 audits/ich/opportunity-coverage-v1-1/latest/source-inventory.json、coverage-matrix.json。

## 6. 用户流程与旧数据保护

综合入口使用共享筛选、详情、既有跟进和导出路径；同一 opportunity 跨类型不复制身份。采购机会仍由原采购视图处理，Competition/Memo/LOEWE 数据未批量改写；来源配置和管理员字段未被本轮覆盖，私有跟进不进入公开 coverage API。

## 7. 实际测试和发布证据

- npm run typecheck：PASS
- npm run verify:all：PASS（含本轮 coverage fixture）
- npm run verify:opportunity:coverage：PASS
- npm run verify:opportunity:coverage:sources：PASS（含主 Pipeline 隔离运行）
- npm run verify:procurement:workbench：PASS
- npm run verify:procurement:change-feed：PASS
- npm run verify:procurement:sources：PASS
- npm run verify:ich:procurement:phase1:2a：PASS
- npm run verify:ich:v211：PASS；历史赛事证据仍显示 BASELINE_UNRECOVERABLE / UNKNOWN 26，未伪造清零
- Live read：仅官方公开 GET，未带凭证、未写生产
- Production：NOT_DEPLOYED

## 8. 状态、缺口、唯一人工清单

状态：SHIPPED_WITH_BACKLOG。N1 综合工作台和共享 assessment 已完成；N2 CNAF 已完成隔离 Pipeline 验证，EEN 仍是来源级观察/待真实目标正例，其他来源的细分 adapter 仍有缺口。若要上线，只需另行走生产审批、备份、受控发布与回滚；本轮无需人工动作。

## 9. 后续运营建议

下一目标建议优先为已注册但 NEEDS_ADAPTER 的 On the Move 做一个正文级适配器，并在同一 coverage matrix 中补真实 current/early 证据；不新增并行雷达系统。
