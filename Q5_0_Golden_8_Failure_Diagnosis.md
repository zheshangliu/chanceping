# Q.5-0 Golden 8 Failure Diagnosis

生成时间：2026-07-03

## 1. 诊断结论

本轮 Q.4 Golden 20 中 8 个部分通过案例并不是“Serper 没搜到”，也不是“画像理解错误”。

真正的主要瓶颈是：

```text
Serper 返回了 raw candidates
→ semantic classifier 也识别出 direct_opportunity / business_lead / channel_partner_lead / customer_lead
→ 但 ruleFilter 使用过长、过窄的 core_keywords_zh 做硬过滤
→ 所有 key candidates 被“关键词不匹配”拒绝
→ opportunityCards = 0
→ 前端表现为搜索相关性不足、机会卡行动价值不足
```

因此，Q.5 不应先把重点放在“让客户多填信息”。客户信息不足确实存在，但当前 8 个弱项的第一根因是：**搜索结果已经存在，但准入过滤过窄，尤其不适合 BD / 订单 / 渠道 / 线索型机会。**

## 2. 总体漏斗

| 案例 | 行业/角色 | raw results | dedup raw | key semantic candidates | rule passed | opportunity cards | 主要阻断原因 |
|---:|---|---:|---:|---:|---:|---:|---|
| #3 | 广州婚庆公司 | 75 | 53 | 16 | 0 | 0 | 关键词不匹配 |
| #4 | 员工福利礼品供应商 | 75 | 68 | 18 | 0 | 0 | 关键词不匹配 |
| #8 | 猎头顾问 | 66 | 61 | 34 | 0 | 0 | 关键词不匹配 |
| #9 | 非遗文创公司 | 75 | 65 | 32 | 0 | 0 | 关键词不匹配 |
| #11 | 自由摄影师 | 75 | 64 | 22 | 0 | 0 | 关键词不匹配 |
| #13 | 宠物用品品牌 | 75 | 71 | 28 | 0 | 0 | 关键词不匹配 |
| #19 | B2B SaaS 出海 | 75 | 72 | 21 | 0 | 0 | 关键词不匹配 |
| #20 | 手工饰品工作室 | 75 | 73 | 25 | 0 | 0 | 关键词不匹配 |

说明：

- `raw results` 来自 Serper cache 复盘，没有重新调用 live API。
- `key semantic candidates` 包括 `direct_opportunity`、`business_lead`、`channel_partner_lead`、`customer_lead`。
- 8 个案例均存在 key semantic candidates，但全部被 ruleFilter 拒绝。

## 3. 根因排序

### P0：ruleFilter 的关键词策略过窄

当前 `core_keywords_zh` 多为雷达版本卡里的长短语，例如：

- 高端婚礼客户线索
- 企业福利采购
- 招聘需求
- 文创赛事
- 摄影比赛
- 宠物展会
- 手工市集

实际搜索结果往往使用近义表达：

- 婚礼套餐、婚宴场所、酒店婚礼服务
- 员工福利项目供应商征集、工会福利服务采购项目
- IPO Jobs、财务总监职位、跨境财务主管
- 文创大赛、文创产品设计、博物馆文创大赛
- 摄影大赛、征稿启事、フォトコンテスト
- 宠物展、展商申请、经销商加入
- 摊主招募、创意市集、展位申请

这些都与用户需求相关，但不包含完整长短语，所以被规则层全部拒绝。

### P1：BD 类机会不适合只用“报名/申报/招标”逻辑

弱项行业多数是 BD / 订单 / 渠道型：

- 婚庆找客户与酒店会所合作
- 员工福利找企业/工会采购与供应商入库
- 猎头找招聘信号与企业扩张信号
- 宠物用品找展会、渠道、商超与平台入驻
- B2B SaaS 找代理商、渠道合作、招商和商务配对
- 手工饰品找市集、买手店、电商平台活动

这些结果不一定会写“报名入口”或“官方公告”，但可能已经足以支持本周行动：联系、入库、投递合作、报名摊位、加入渠道。

### P2：策略澄清问题仍偏抽象

部分追问仍像内部分类：

```text
直接报名/招采入口、客户或采购线索、渠道合作、协会目录、观察信号
```

这对普通客户不够自然。它能提高系统策略，但用户未必知道该怎么回答。

### P3：测试报告字段容易误导

Golden 20 报告里的“搜索相关性不足”实际更准确应拆成：

```text
raw 搜索相关性
key semantic candidate 数量
rule/filter 准入结果
机会卡行动价值
```

本轮 8 个案例 raw 搜索并非完全不相关；真正失败点是准入过滤后没有卡片。

## 4. 分案例诊断

### #3 广州婚庆公司

RadarVersionSpec 摘要：

- targetUser：广州婚庆公司
- opportunityIntents：高端婚礼客户线索、酒店会所合作、品牌异业合作、婚礼项目机会
- sourceArchetypes：高端酒店官网、会所官网、品牌异业合作页面、婚礼行业门户、企业招聘/联系页
- missingConfig：指定官网、协会、平台或行业信息源

Search themes / query families：

- 高端婚礼客户线索：customer_lead，高端酒店官网
- 酒店会所合作：channel_partner_lead，酒店会所官网
- 品牌异业合作：channel_partner_lead，品牌异业合作页面
- 婚礼项目机会：direct_opportunity，婚礼行业门户
- 高端客户线索补充：customer_lead，企业招聘/联系页

实际 query 示例：

- 广州 高端婚礼 套餐 2025
- 广州 酒店 婚礼 咨询 报名
- 广州 酒店 婚礼 合作 招募
- 广州 婚礼 项目 招标 2025
- 广州 高端 婚礼 策划 招聘

结果漏斗：

- raw：75
- dedup：53
- key candidates：16
- rule passed：0
- accepted cards：0
- rejected / low_action / unknown：主要为 watch_signal 35、business_lead 13、direct_opportunity 3、rejected 2

典型结果：

- 四季酒店-广州婚礼套餐
- 豪华浪漫婚礼，由此开启 - The Ritz-Carlton
- 2025年东涌镇第七届水乡集体婚礼活动项目谈判邀请
- 广州婚礼策划师招聘

判断：

- 有业务线索和直接项目，但被 `高端婚礼客户线索 / 酒店会所合作 / 品牌异业合作 / 婚礼项目机会` 这些长关键词挡掉。
- `business_lead` 存在被误过滤。
- source archetype 不算完全错误，但应补充“酒店宴会/婚宴页、婚礼场地页、政府集体婚礼项目、婚博会展商/合作页”。

Q.5 修复建议：

- BD 类婚庆雷达允许酒店婚宴页、婚礼场地页、集体婚礼项目、婚博会展商页进入重点线索区。
- 强制标注“需联系确认”，不要写成已确认客户需求。
- 策略追问改成：“你优先找高端酒店/会所合作、婚博会展商机会，还是品牌异业合作？”

### #4 员工福利和节日礼品供应商

RadarVersionSpec 摘要：

- targetUser：员工福利和节日礼品供应商
- opportunityIntents：企业福利采购、工会福利项目、节日礼品招标
- sourceArchetypes：企业官网采购公告、招标采购平台、工会或福利协会网站、政府采购网、企业招聘/供应商注册页
- missingConfig：指定官网、协会、平台或行业信息源

实际 query 示例：

- 广东 企业福利 采购 招标
- 广东 工会福利 招标 公告
- 香港 員工福利 採購 招標
- 广东 工会 节日礼品 供应商 征集
- 广东 企业 供应商 注册 福利

结果漏斗：

- raw：75
- dedup：68
- key candidates：18
- rule passed：0
- accepted cards：0
- semantic：business_lead 11、direct_opportunity 7、watch_signal 42、reference_case 3、rejected 5

典型结果：

- 人保财险广东省分公司员工福利项目供应商征集公告
- 中国人寿广东省分公司工会福利服务采购项目
- 华安保险员工工会福利采购项目公开招标公告
- 香港大学深圳医院员工劳保福利采购项目遴选公告

判断：

- 这组搜索质量其实较好，已经有明显 direct opportunity。
- 失败几乎完全是 ruleFilter 精确长词导致。
- `企业福利采购` 与真实标题“员工福利项目供应商征集”语义一致，但字面不一致。

Q.5 修复建议：

- 员工福利类添加同义词：员工福利、劳保福利、工会福利、节日慰问品、慰问品采购、供应商征集、遴选公告。
- direct_opportunity 的采购/招标/征集结果应优先进入重点机会卡。

### #8 猎头顾问

RadarVersionSpec 摘要：

- targetUser：猎头顾问
- opportunityIntents：招聘需求、跨境财务岗位、资金岗位、税务岗位、内控岗位、IPO相关招聘、出海扩张招聘
- sourceArchetypes：公司官网招聘页、企业招聘门户、猎头合作平台、IPO相关公司新闻
- missingConfig：指定官网、协会、平台或行业信息源

实际 query 示例：

- IPO 招聘 财务 香港
- site:linkedin.com/jobs IPO 财务 香港
- 出海 招聘 财务 新加坡
- 招聘 跨境财务 香港
- 即将IPO 公司 招聘 财务总监 新加坡

结果漏斗：

- raw：66
- dedup：61
- key candidates：34
- rule passed：0
- accepted cards：0
- semantic：business_lead 31、direct_opportunity 3、watch_signal 18、reference_case 6、rejected 3

典型结果：

- IPO Jobs in 香港
- Financial Controller, BioTech IPO
- 新加坡海外财务总监招聘
- 跨境工作 Jobs in Hong Kong
- IPO Finance Jobs

判断：

- 猎头需求本质是招聘线索和公司扩张信号，不一定是“机会公告”。
- 搜索结果与需求高度相关，但 `招聘需求 / 跨境财务岗位 / 资金岗位` 等中文长词不匹配英文/繁体职位页。
- `business_lead` 被误过滤明显。

Q.5 修复建议：

- 招聘线索类需要中英繁体职位同义词：finance controller、treasury、tax、internal control、IPO、overseas expansion、cross-border finance。
- 猎头案例中 LinkedIn/JobsDB/Indeed/公司 careers 页应允许作为 `business_lead`，标注“需联系确认，不代表企业委托猎头”。
- 策略追问应问：“你优先找公开招聘岗位，还是 IPO/出海扩张信号中可能产生委托需求的公司名单？”

### #9 岭南押花非遗和文创产品公司

RadarVersionSpec 摘要：

- targetUser：做岭南押花非遗和文创产品的公司
- opportunityIntents：文创赛事、工艺美术赛事、博物馆文创征集、文旅伴手礼采购、非遗展会
- sourceArchetypes：赛事官网、博物馆官网、文旅部门官网、非遗协会官网、文创平台
- missingConfig：优先国家/城市/行业范围、指定官网、协会、平台或行业信息源

实际 query 示例：

- 文创大赛 报名 2025
- 工艺美术作品征集 官网
- 博物馆文创产品 征集 官网
- 文旅伴手礼 采购 招标
- 非遗展会 2025 参展

结果漏斗：

- raw：75
- dedup：65
- key candidates：32
- rule passed：0
- accepted cards：0
- semantic：direct_opportunity 29、business_lead 2、customer_lead 1、watch_signal 26、reference_case 2、rejected 5

典型结果：

- 第四届全国数字文创大赛
- 文创大赛首页
- 中国工艺美术学会技艺大赛
- 中国大运河博物馆文创设计大赛
- 文旅伴手礼公共品牌商品招标

判断：

- 搜索质量不差，direct opportunity 很多。
- 被 `文创赛事 / 工艺美术赛事 / 博物馆文创征集 / 文旅伴手礼采购 / 非遗展会` 长词挡住。
- 地域确实缺失，但不是本轮零卡的主因。

Q.5 修复建议：

- 赛事/征集类应接受“文创大赛、设计大赛、作品征集、文创产品设计、旅游商品、伴手礼、非遗月、非遗展览”等同义表达。
- 策略追问可补地域：“优先广东/大湾区，还是全国文创、博物馆和文旅征集都看？”

### #11 自由摄影师

RadarVersionSpec 摘要：

- targetUser：自由摄影师
- opportunityIntents：摄影比赛、品牌征稿、城市影像计划、展览征集
- sourceArchetypes：摄影比赛官网、品牌官方征稿页、城市文化机构官网、美术馆展览征集页、摄影协会会员目录

实际 query 示例：

- 摄影比赛 投稿 2025
- 摄影大赛 征稿 2025 site:.cn
- 品牌 摄影 征集 2025 site:.cn
- 摄影展 投稿 2025
- 写真コンテスト 2025 募集

结果漏斗：

- raw：75
- dedup：64
- key candidates：22
- rule passed：0
- accepted cards：0
- semantic：direct_opportunity 21、business_lead 1、watch_signal 33、reference_case 2、rejected 7

典型结果：

- YellowKorner Awards 摄影大赛
- 八里湖新区摄影大赛征稿启事
- 第五届“城市与人”广州城市摄影大赛
- 中国摄影家协会征稿平台
- 写真・フォトコン

判断：

- 搜索结果有明显投稿/比赛/征稿行动入口。
- 主要被 `摄影比赛 / 品牌征稿 / 城市影像计划 / 展览征集` 长词过滤。
- 日本 query 有效，但需要日文关键词进入匹配词典。

Q.5 修复建议：

- 摄影类同义词：摄影大赛、フォトコン、写真コンテスト、征稿启事、作品征集、大展征稿、応募、募集。
- `bhuntr.com` 等聚合平台可以进入观察/参考，但官方协会/主办方页面优先。

### #13 宠物用品品牌

RadarVersionSpec 摘要：

- targetUser：宠物用品品牌
- opportunityIntents：宠物展会、渠道招商、商超采购、跨境平台活动、宠物行业奖项
- sourceArchetypes：宠物行业展会官网、商超采购平台、跨境平台活动页面、宠物行业奖项官网、渠道招商页面

实际 query 示例：

- 宠物展会 2025 参展 报名
- 宠物展 展商 申请
- 宠物用品 商超 采购 招标
- 跨境 宠物 品牌 入驻 申请
- 宠物 经销商 申请 加入

结果漏斗：

- raw：75
- dedup：71
- key candidates：28
- rule passed：0
- accepted cards：0
- semantic：direct_opportunity 10、business_lead 12、channel_partner_lead 6、watch_signal 25、reference_case 8、rejected 10

典型结果：

- 亚洲宠物展
- 宠物展展商申请
- Chewy 中国卖家入驻指南
- Pet Innovation Awards
- 成为合作经销商

判断：

- 宠物展、跨境平台、经销商加入等有行动价值。
- `宠物展会` 与真实标题“宠物展”不完全匹配；`商超采购` 的真实结果可能写“供应商招募/采购/入驻”。

Q.5 修复建议：

- 宠物类应接受“宠物展、宠交会、展商申请、参展信息、经销商、代理、入驻、seller、vendor、supplier、Pet Innovation Awards”等变体。
- channel_partner_lead 应进入重点区域，标注需联系确认。

### #19 B2B SaaS 出海

RadarVersionSpec 摘要：

- targetUser：B2B SaaS 公司
- opportunityIntents：东南亚展会、创业扶持、渠道合作、政府招商、潜在代理商线索
- sourceArchetypes：展会官网、创业扶持机构官网、渠道合作平台、政府招商部门官网、代理商名录

实际 query 示例：

- Southeast Asia B2B SaaS expo 2025
- register B2B SaaS conference Southeast Asia
- startup grant Southeast Asia 2025
- channel partner program Southeast Asia SaaS
- B2B SaaS reseller Southeast Asia

结果漏斗：

- raw：75
- dedup：72
- key candidates：21
- rule passed：0
- accepted cards：0
- semantic：direct_opportunity 7、business_lead 11、channel_partner_lead 3、watch_signal 46、rejected 5

典型结果：

- SaaS events and conferences
- DigiMarCon Southeast Asia
- MYStartup accelerator programs
- Thailand BOI investment promotion
- IT solutions distributor Philippines

判断：

- B2B SaaS 泛行业确实容易搜出泛资讯，但仍有可用线索。
- 中文 core keywords 是“展会、创业扶持、渠道合作、政府招商、代理商”，但很多英文结果不含这些中文词，导致全拒。
- 之前讨论过的“B2B 商品交易 SaaS / 零售机会雷达 V1.1”能显著提升策略精度；当前仍是泛 SaaS。

Q.5 修复建议：

- 英文查询必须生成英文 core keywords：conference、expo、accelerator、grant、investment promotion、channel partner、reseller、distributor、market entry。
- 对 B2B SaaS 应强制策略分歧追问：泛 SaaS 还是垂直行业？找展会/扶持，还是渠道/代理/客户线索？

### #20 手工饰品工作室

RadarVersionSpec 摘要：

- targetUser：手工饰品工作室
- opportunityIntents：手工市集、买手店合作、展会摊位、电商平台活动、品牌联名、社媒曝光
- sourceArchetypes：手工市集主办方官网、买手店合作页面、展会官网、电商平台活动页面、品牌联名征集页面、社媒活动页面

实际 query 示例：

- 手工市集 摊位 招募 2025
- 手工市集 报名 摊主
- 买手店 合作 手工饰品
- 文创展会 参展 报名
- 淘宝 手工艺 活动 报名

结果漏斗：

- raw：75
- dedup：73
- key candidates：25
- rule passed：0
- accepted cards：0
- semantic：direct_opportunity 13、business_lead 11、channel_partner_lead 1、watch_signal 37、reference_case 4、rejected 7

典型结果：

- 手作市集
- 摊主招募
- 创意市集招募
- 文创展会参展报名
- 拼多多商家入驻

判断：

- 有摊主招募、展会报名、平台入驻等行动入口。
- 被“手工市集、买手店合作、展会摊位、电商平台活动、品牌联名、社媒曝光”精确短语挡住。
- 部分社媒结果需要保留为待复核线索，不应直接当已确认机会。

Q.5 修复建议：

- 手作/市集类同义词：手作市集、创意市集、摊主招募、品牌招募、展位申请、商家入驻、寄售、联名征集。
- Instagram/小红书/微博类结果可作为 watch_signal 或 business_lead，但需标注“平台内容，需联系确认”。

## 5. Q.5 修复建议

### Q.5-A：先修准入过滤，而不是先加问题

建议新增一个 live providerRouting 专用的准入策略：

```text
如果结果来自 RadarVersionSpec.queryFamilies 生成的 query，
且 semantic_type 是 direct_opportunity / business_lead / channel_partner_lead / customer_lead，
则不再强制要求命中完整 core_keywords_zh 长短语。
```

可选安全约束：

- 仍执行 URL 安全、去重、排除规则。
- 若标题/摘要完全不含主题词、行业词、行动词、来源词，则降为 watch_signal，不进入重点卡。
- 对 business/channel/customer lead 强制打“需联系确认 / 待复核”。

### Q.5-B：把 core_keywords 从“长短语”拆成“匹配词包”

每个 RadarVersionSpec 应派生：

```text
literalKeywords：客户原话长短语，用于展示
matchKeywords：短词、同义词、跨语言词，用于过滤
actionKeywords：报名、征集、招募、采购、入驻、申请、联系等
sourceKeywords：协会、展会、平台、供应商、官网、careers、partner 等
```

ruleFilter 应优先使用 `matchKeywords/actionKeywords/sourceKeywords`，而不是直接用展示型长短语。

### Q.5-C：BD 类 buckets 进入重点区

对 BD / 订单 / 渠道行业，允许以下类型进入重点区域：

- business_lead
- channel_partner_lead
- customer_lead
- association_directory（作为线索资源）
- watch_signal（作为观察信号，不进重点机会卡）

展示要求：

- 类型：可行动线索
- 状态：需联系确认 / 待复核
- 不是已确认采购、合作、招聘、报名机会

### Q.5-D：策略澄清只问“分叉问题”

不要问更多普通字段。只在搜索策略真的分叉时问 1 个问题。

例子：

- 婚庆：优先找高端酒店/会所合作、婚博会，还是品牌异业合作？
- 员工福利：优先找工会/政府采购、企业福利招标，还是企业客户线索？
- 猎头：优先找招聘岗位，还是 IPO/出海/扩张信号里的潜在委托公司？
- B2B SaaS：泛 SaaS 出海，还是某个垂直行业客户/渠道机会？
- 手工饰品：优先找市集摊位、买手店寄售，还是电商平台活动？

用户不答时按默认策略继续，并写入雷达版本卡。

### Q.5-E：补诊断可观测性

下一轮 Golden 报告应增加：

- rawCandidateCount
- keySemanticCandidateCount
- rulePassedCount
- rejectedReasonTop3
- businessLeadRejectedCount
- sourceArchetypeNormalized
- acceptedCardCount

这样“搜索质量不足”能拆成更可修的原因。

## 6. 是否应立即修“客户信息不足”

结论：**要修，但不是第一刀。**

本轮 8 个弱项显示：

- 客户信息不完整会影响策略精度。
- 但当前零卡的直接原因是过滤层把已有候选全部挡掉。
- 如果只增加追问，不修准入过滤，即使客户回答更多，仍可能因为关键词不匹配而零卡。

建议顺序：

```text
1. 修 live key candidate 准入过滤
2. 拆分展示关键词与匹配关键词
3. 允许 BD 类线索进入重点区域但标注待复核
4. 再做策略分歧追问
5. 重新跑 Golden 8，再跑 Golden 20
```

## 7. 下一阶段建议

建议进入：

```text
Milestone Q.5：Live Candidate Admission + Strategy Clarification
```

Q.5 的首要目标不是扩大 live API，也不是重做 UI，而是：

```text
让已经搜到的相关 raw results 能诚实地进入机会卡或线索区。
```

通过目标：

- Golden 8 中至少 6 个从部分通过提升为强通过或接近强通过。
- Golden 20 强通过 >= 15。
- 不出现 API key 泄露。
- 不静默回退 mock。
- 不把搜索发现包装成已核验事实。
- business_lead / channel_partner_lead / customer_lead 均明确标注待复核。
