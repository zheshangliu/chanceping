# 盯非遗｜本轮采购机会摘要

生成时间：2026-09-15（Asia/Shanghai）
数据截至：M0 生产 release `20260915T041344Z-f514ee6b624d` 的两轮受控运行；生产 registry 38 条，采购公开 3 条。
隔离扩源读取：2026-09-15 12:26（北京时间），4 个新增来源均 200；不写入生产。

## 当前可研究的采购

1. **Spain – Cultural event organisation services**
   - 买方：当前记录未解析；地区：GLOBAL。
   - 截止：`2026-10-06T21:59:00Z`，精度为公告解析时间。
   - 官方证据：[TED notice 616562-2026](https://ted.europa.eu/en/notice/-/detail/616562-2026)。
   - 适配理由：文化活动组织与相关供应链服务可能覆盖活动执行/内容支持。
   - 资格缺口：资格、预算、履约地点和可接受响应方式待核验；不代表可直接投标。

2. **Festive Pantomime Maesteg Town Hall & The Met, Abertillery 2026/27**
   - 买方：Awen Cultural Trust；地区：英国威尔士。
   - 截止：当前记录未解析。
   - 官方证据：[Sell2Wales notice 160359](https://www.sell2wales.gov.wales/Search/Search_Switch.aspx?ID=160359)。
   - 适配理由：演出/活动制作需求可能与文化活动执行能力相关。
   - 资格缺口：本地履约、舞台制作能力、资格附件和响应截止必须回到公告核验。

3. **Amgueddfa Cymru - Events Production Sain Ffagan - Christmas 2026**
   - 买方：Amgueddfa Cymru - National Museum Wales；地区：英国威尔士。
   - 截止：当前记录未解析。
   - 官方证据：[Sell2Wales notice 161624](https://www.sell2wales.gov.wales/Search/Search_Switch.aspx?ID=161624)。
   - 适配理由：博物馆节庆活动制作，可能涉及活动执行与现场服务。
   - 资格缺口：设备/制作能力、服务地点、保险资质与响应方式待核验。

## 提前跟进

本次生产公开池没有额外已确认的采购意向/市场征集记录；不要把隔离扩源的 4 条 live-read 结果写成生产订单。

## 本轮关键变化

- M0 五源生产上线已完成并通过两轮受控真实运行：38 source registry，2533 pool，3 public procurement。
- M1 工作台、私有跟进、变化摘要、CSV/Markdown 导出已在功能分支实现并通过 fixture；尚未上线。
- M2 新增 4 个独立来源族完成隔离主 Pipeline live-read：广州阳光、南方电网、广州文广旅局、UK Contracts Finder；raw 91、pool 80、公开相关 4。
- 5 个候选没有冒充成功：广东采购云超时、香港 GLD API 未确认、深圳阳光平台不可稳定访问、南方招标和 AIIB 延期。
- 来源失败不阻断其他来源；生产质量门仍为 0。自然 72h 周期尚未观察，当前是受控运行证据。

## 历史买方观察

生产 M0 当前仅有上述 3 条采购卡。历史审计/买方研究只用于了解需求周期，不计入本轮可参与数量；没有为了凑数追加历史或卖方供货页。
