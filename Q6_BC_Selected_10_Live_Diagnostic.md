# Q.6-B/C Selected 10 Live Diagnostic

生成时间：2026-07-03T07:51:15.189Z

## 结论

- 本轮仅复测上次人工判为部分通过的 10 个案例：1、2、3、4、7、8、9、12、15、17。
- 有重点机会卡：8/10。
- 环境或请求失败：0/10。
- 每个案例每条 query 最多 2 个结果，仅精读最高优先级 URL；本报告用于判断 Q.6 闸门，不替代完整 Golden 20。
- Q.6-A `accept` 后还会经过 Q.6-B LLM/fallback candidate judge 与 Q.6-C source ranking/card cap。
- Q.6-C 默认重点候选最多 5 个；超过上限的 key candidates 降到观察层，raw audit 保留原始 semantic bucket。

## 候选漏斗

| # | 运行 | raw | Q6A accept | Judge accept | cap included | cards | 前三张卡 | 主要原因 |
|---:|---|---:|---:|---:|---:|---:|---|---|
| 1 | succeeded | 24 | 2 | 2 | 2 | 2 | Home - U.S. Go Congress 2026；致远杯南加围棋赛1/17开战总奖金6000美元 | stale_or_uncertain(11)；insufficient_action_evidence(7)；explicit_exclusion(3)；matched_radar_strategy(2) |
| 2 | succeeded | 22 | 1 | 1 | 1 | 1 | 一道乒乓乓响｜多项赛事报名进行时，更有精彩抢先看！ - 解放日报 | insufficient_action_evidence(9)；stale_or_uncertain(9)；action_mismatch(3)；explicit_exclusion(3) |
| 3 | succeeded | 18 | 2 | 2 | 2 | 2 | 广州海珠举办婚庆创新赋能大赛，向社会征集三大“婚恋幸福地标”打造 ...；广州海珠举办婚庆创新赋能大赛，向社会征集三大“婚恋幸福地标”打造 ... | insufficient_action_evidence(10)；stale_or_uncertain(6)；matched_radar_strategy(2) |
| 4 | succeeded | 29 | 3 | 3 | 3 | 3 | 工会2026年春节福利采购项目招标公告；节日礼品采购单模板- 飞书官网 - Feishu；员工福利 - 外企德科人力资源服务安徽有限公司 | stale_or_uncertain(10)；insufficient_action_evidence(10)；matched_radar_strategy(3)；subject_mismatch(3) |
| 7 | insufficient_results | 18 | 1 | 0 | 0 | 0 | 无 | stale_or_uncertain(11)；insufficient_action_evidence(4)；matched_radar_strategy(1)；action_mismatch(1) |
| 8 | succeeded | 24 | 10 | 3 | 3 | 3 | 職位空缺- 香港金融管理局；2026年香港拟美股IPO招聘信息 - 猎聘；CAXA正在招聘IPO财务经理/ 高级财务专员(北京市) - 领英 | matched_radar_strategy(10)；insufficient_action_evidence(8)；subject_mismatch(4)；action_mismatch(1) |
| 9 | succeeded | 30 | 7 | 7 | 5 | 5 | 【作品征集】第五届内蒙古工艺美术精品展 - 乌审旗；[XLS] 汇总表（不需要填写）（不要删除）；北京市文化和旅游局_政府采购 | stale_or_uncertain(15)；matched_radar_strategy(7)；insufficient_action_evidence(3)；expired_deadline(2) |
| 12 | insufficient_results | 28 | 0 | 0 | 0 | 0 | 无 | stale_or_uncertain(16)；insufficient_action_evidence(6)；generic_information(6)；action_mismatch(1) |
| 15 | succeeded | 29 | 1 | 1 | 1 | 1 | 下属单位-深圳市科技创新局网站 | stale_or_uncertain(10)；explicit_exclusion(8)；insufficient_action_evidence(5)；target_mismatch(3) |
| 17 | succeeded | 27 | 8 | 5 | 5 | 5 | 苏州工业园区管理委员会；临港工业园节点绿化改造及环境整治工程竞争性磋商公告；环保招标采购信息 | insufficient_action_evidence(9)；matched_radar_strategy(8)；stale_or_uncertain(6)；generic_information(2) |

## 前五 raw audit

| # | 前五候选审计 |
|---:|---|
| 1 | Home - U.S. Go Congress 2026 [direct_opportunity/accept/included/official_or_primary/91]；致远杯南加围棋赛1/17开战总奖金6000美元 [direct_opportunity/accept/included/credible_secondary/80]；上海市围棋协会 [rejected/downgrade_to_watch_signal/not_key_candidate/official_or_primary/62]；2026【第二十屆坤泰盃全國圍棋賽】 - 比賽- 獎金獵人 [rejected/downgrade_to_watch_signal/not_key_candidate/credible_secondary/57]；International GO Federation: IGF [direct_opportunity/downgrade_to_watch_signal/not_key_candidate/official_or_primary/54] |
| 2 | 2026 Events Calendar - International Table Tennis Federation [direct_opportunity/downgrade_to_watch_signal/not_key_candidate/official_or_primary/73]；一道乒乓乓响｜多项赛事报名进行时，更有精彩抢先看！ - 解放日报 [direct_opportunity/accept/included/credible_secondary/71]；World Table Tennis Calendar [direct_opportunity/downgrade_to_watch_signal/not_key_candidate/credible_secondary/67]；News - International Table Tennis Federation [direct_opportunity/downgrade_to_watch_signal/not_key_candidate/official_or_primary/67]；International Table Tennis Federation - Home of Table Tennis [watch_signal/downgrade_to_watch_signal/not_key_candidate/official_or_primary/61] |
| 3 | 广州塔之巅倾情见证“云端婚礼” 海珠“520幸福五重奏”唱响全城浪漫 [watch_signal/downgrade_to_watch_signal/not_key_candidate/official_or_primary/63]；2026年“海誓山盟·珠联璧合”广州婚礼时尚周暨第二届海珠婚庆节3月 ... [channel_partner_lead/downgrade_to_watch_signal/not_key_candidate/official_or_primary/63]；广州海珠举办婚庆创新赋能大赛，向社会征集三大“婚恋幸福地标”打造 ... [direct_opportunity/accept/included/reference_or_news/58]；广州海珠举办婚庆创新赋能大赛，向社会征集三大“婚恋幸福地标”打造 ... [direct_opportunity/accept/included/reference_or_news/58]；婚姻登记管理信息-广州市集体婚礼招募公告 [rejected/downgrade_to_watch_signal/not_key_candidate/official_or_primary/57] |
| 4 | 工会2026年春节福利采购项目招标公告 [direct_opportunity/accept/included/credible_secondary/76]；香港大学深圳医院员工劳保福利采购项目遴选公告 [watch_signal/downgrade_to_watch_signal/not_key_candidate/official_or_primary/67]；节日礼品采购单模板- 飞书官网 - Feishu [business_lead/accept/included/credible_secondary/63]；员工福利 - 外企德科人力资源服务安徽有限公司 [channel_partner_lead/accept/included/credible_secondary/63]；广东公共求职招聘服务平台 [business_lead/downgrade_to_watch_signal/not_key_candidate/official_or_primary/62] |
| 7 | 创业补贴-深圳市人力资源和社会保障局网站 [channel_partner_lead/downgrade_to_watch_signal/not_key_candidate/official_or_primary/68]；Tuya AI Innovators Hackathon 2025活动报名 [reference_case/downgrade_to_watch_signal/not_key_candidate/credible_secondary/63]；AI 初创公司计划 - Google Cloud [watch_signal/downgrade_to_watch_signal/not_key_candidate/credible_secondary/56]；初创公司计划的资格要求和福利 [reference_case/downgrade_to_watch_signal/not_key_candidate/credible_secondary/54]；加入初创企业扶持计划，获取云服务抵扣券 - AWS - Amazon.com [reference_case/downgrade_to_watch_signal/not_key_candidate/credible_secondary/54] |
| 8 | 職位空缺- 香港金融管理局 [business_lead/accept/included/credible_secondary/67]；2026年香港拟美股IPO招聘信息 - 猎聘 [business_lead/accept/included/aggregator/58]；内控审计工程师- 广州金升阳科技有限公司招聘 [business_lead/downgrade_to_watch_signal/not_key_candidate/credible_secondary/56]；财务风险内控招聘_侨银城市管理股份有限公司招聘 - 智联招聘 [business_lead/downgrade_to_watch_signal/not_key_candidate/credible_secondary/53]；CAXA正在招聘IPO财务经理/ 高级财务专员(北京市) - 领英 [business_lead/accept/included/aggregator/52] |
| 9 | 【作品征集】第五届内蒙古工艺美术精品展 - 乌审旗 [direct_opportunity/accept/included/official_or_primary/89]；[XLS] 汇总表（不需要填写）（不要删除） [direct_opportunity/accept/included/official_or_primary/83]；北京市文化和旅游局_政府采购 [customer_lead/accept/included/official_or_primary/81]；非遗- 设计竞赛网 [direct_opportunity/accept/included/credible_secondary/71]；公告- 成都博物馆 [business_lead/accept/included/credible_secondary/63] |
| 12 | 北京市商务局关于印发《北京市推动跨境电商高质量发展行动方案 ... [watch_signal/downgrade_to_watch_signal/not_key_candidate/official_or_primary/70]；深圳市商务局携手全球电商平台助推跨境电商进军新市场 [business_lead/downgrade_to_watch_signal/not_key_candidate/official_or_primary/61]；2026跨境电商交易博览会\|杭州跨境电商展\|深圳跨境电商展\|跨境电商 ... [direct_opportunity/downgrade_to_watch_signal/not_key_candidate/credible_secondary/57]；第三届中国国际供应链促进博览会（2025） [direct_opportunity/downgrade_to_watch_signal/not_key_candidate/official_or_primary/57]；深圳市推动跨境电子商务高质量发展行动方案（2022-2025）-政策法规 [watch_signal/downgrade_to_watch_signal/not_key_candidate/official_or_primary/57] |
| 15 | 下属单位-深圳市科技创新局网站 [channel_partner_lead/accept/included/official_or_primary/75]；【竞赛活动】广州市教育局关于2025-2028学年面向中小学生的全市 ... [watch_signal/downgrade_to_watch_signal/not_key_candidate/official_or_primary/73]；穗港聚力AI赋能智慧建造！广州“科创下午茶”走进香港 [channel_partner_lead/downgrade_to_watch_signal/not_key_candidate/official_or_primary/70]；通知公告-深圳市科技创新局网站 [business_lead/downgrade_to_watch_signal/not_key_candidate/official_or_primary/68]；广州以1+8模式普及人工智能通识教育 [customer_lead/downgrade_to_watch_signal/not_key_candidate/official_or_primary/61] |
| 17 | 苏州工业园区管理委员会 [direct_opportunity/accept/included/official_or_primary/89]；长三角生态绿色一体化发展示范区生态环境专项规划（2021-2035年） [rejected/downgrade_to_watch_signal/not_key_candidate/official_or_primary/73]；中共广东省委办公厅广东省人民政府办公厅印发《广东省推动制造业 ... [customer_lead/downgrade_to_watch_signal/not_key_candidate/official_or_primary/70]；临港工业园节点绿化改造及环境整治工程竞争性磋商公告 [business_lead/accept/included/aggregator/67]；招标采购 - 广东环境保护工程职业学院 [direct_opportunity/downgrade_to_watch_signal/not_key_candidate/official_or_primary/64] |

## 使用边界

- 本轮使用 Q.6-B 有限候选裁判；LLM 只能基于搜索摘要和雷达版本判断，不得补造字段事实。
- 本轮使用 Q.6-C 来源权威性排序和卡片上限；排序结果不是字段级核验事实。
- 无卡片不自动等于产品失败：可能是当前小样本没有足够证据，但不得静默回退演示数据。

## 人工复核与闸门判断

- 机制改进：Q.6-B/C 已经明显收窄候选。例如 #8 猎头从 Q.6-A 的 10 个 accept 降到 3 个 judge accept；#17 工业环保从 8 个 accept 降到 5 个；#7 AI 创业者唯一 accept 被降级，没有硬凑卡。
- 审计改进：raw audit 保留原始 semantic bucket，同时 final eligibility 可被降级；这避免了报告只剩 rejected、看不到原始 direct/business/watch/reference 分层的问题。
- 当前不建议继续 Golden 8 / Random 10 / Golden 20 全量复测。虽然 8/10 有卡，但强通过不足 7/10，且仍存在明显行动价值问题。

### 仍未达标的案例

- #7 AI 工具创业者：0 张卡。搜索结果多为云厂商初创计划、旧 Hackathon 或资格说明，尚未形成未来 45 天内可申请的 AI Agent / AI 应用 / Hackathon / 开发者大赛机会。
- #12 跨境电商：0 张卡。政策、展会、供应链活动多被降级为观察，说明 query 仍没有稳定打到平台招商、大促报名、供应链合作或平台扶持入口。
- #15 少儿编程：1 张卡但行动价值弱。“下属单位-深圳市科技创新局网站”不是少儿编程机构可执行的招生、课程采购、学校合作或竞赛承办机会。
- #17 工业环保：5 张卡但质量不足。园区官网、绿化改造、泛环保招标采购信息仍会进入重点卡，说明“官方来源”不能直接等于“环保设备采购机会”。
- #3 婚庆：2 张卡但重复，且更像城市婚庆活动/地标征集，不是高端客户线索、酒店会所合作或品牌异业合作。
- #9 非遗文创：出现 XLS 汇总表、泛政府采购页等弱页面，Q.6-C 已限制为 5 张，但页面类型判断仍不够细。

### 建议下一步

1. 进入 Q.6-D：Page-Type And Beneficiary Strictness。
   - 判断页面是不是“公告/招标/报名/征集/供应商入口/合作入口”，还是首页、下属单位、汇总表、模板、新闻、目录、政策规划。
   - 对官网首页、部门栏目页、下属单位页、XLS 汇总表、模板页设置更强降级规则。
2. 增强 Q.6-B prompt/fallback 的“受益人 + 行动入口”双重条件。
   - 少儿编程机构必须看到学校合作、课程采购、招生渠道、竞赛承办等动作。
   - 工业环保设备必须看到设备、废气/污水/除尘/环保治理采购范围，普通绿化、装修、环境整治不能进重点卡。
3. 增加近似标题去重。
   - #3 婚庆重复标题进入两张卡，说明 URL 去重不足以处理同源转载或同标题页面。
4. 改进 no-card 行业的查询策略。
   - #7、#12 不是过滤太严，而是搜索主题没有稳定命中可执行入口；需要更强的 source archetype query 和 action keyword query。
5. Q.6-D 通过 selected 10 后，再跑 Golden 8 / Random 10 / Golden 20。
