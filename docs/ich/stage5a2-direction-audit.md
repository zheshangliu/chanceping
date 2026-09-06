# Stage5-A.2 Batch3 Opportunity Direction 审计

复核时间：2026-09-06T04:00:00.000Z（Asia/Shanghai）

本阶段只修复方向语义和资格边界，不新增机会、不执行 Batch4、不部署。所有官方链接均沿用记录中的 L1 主来源；反向 wholesale 记录保留为 Universal Opportunity Pool only，不再计入 ICH 行动池。

## Batch3 十条记录

| Opportunity | Current Category | Direction | Decision | Reason |
| --- | --- | --- | --- | --- |
| nmaahc-museum-store-vendor-artisan-application | channel_collaboration | supplier_to_institution | KEEP | 官方接受artisan/vendor/supplier提交自己的产品供Museum Store考虑销售。 |
| museumshops-uk-sell-with-us-partnership | channel_collaboration | marketplace_for_institution | RECLASSIFY | 平台服务对象是博物馆、历史建筑、图书馆、美术馆和科学中心，不是普通工艺供应商。 |
| national-museum-australia-museum-shop-wholesale-registration | channel_collaboration | institution_to_retailer | UNIVERSAL_POOL_ONLY | gift shops/gallery shops/retailers注册后采购博物馆自有商品。 |
| met-store-wholesale-retail-institution-inquiry | channel_collaboration | institution_to_retailer | UNIVERSAL_POOL_ONLY | museum store/gallery/gift shop/retail institution采购The Met商品。 |
| van-gogh-museum-shop-new-retailer-wholesale | channel_collaboration | institution_to_retailer | UNIVERSAL_POOL_ONLY | 官方文案是Interested in retailing our products，属于博物馆向零售商批发。 |
| sunshine-makers-market-vendor-application-september-2026 | exhibition_market | marketplace_for_supplier | KEEP | 市集向makers/artists/creators开放展商申请，属于供应方进入市场。 |
| west-coast-craft-fort-mason-night-market-2026 | exhibition_market | marketplace_for_supplier | KEEP | 手工艺夜市接受artist/designer/craftsperson展商申请。 |
| lattin-farms-crafters-fair-vendor-2026 | exhibition_market | marketplace_for_supplier | KEEP | 市场面向local crafters and artisans提供展位销售机会。 |
| yuanmingyuan-national-day-ich-event-procurement-2026 | procurement_project | buyer_to_vendor | KEEP | 圆明园管理处作为采购方采购非遗主题活动执行服务。 |
| xian-museum-collection-resources-partner-call-2026 | channel_collaboration | supplier_to_institution | KEEP | 合作机构向试点博物馆提供IP授权运营、文创开发、生产和销售能力。 |

## 重点官方方向结论

- NMAAHC：https://nmaahc.si.edu/museum-store-vendors，artisan/vendor/supplier 提交自己的产品，`supplier_to_institution`，KEEP。
- National Museum of Australia、The Met Store、Van Gogh Museum：官方均表达零售商采购博物馆自有商品，统一为 `institution_to_retailer`，UNIVERSAL_POOL_ONLY。
- MuseumShops UK：官方限定机构类型，修正为 `marketplace_for_institution`，仅保留 `organization` 申请类型，不计入普通非遗创业主体供应渠道覆盖。
- 西安市博物馆馆藏资源合作：https://www.xawhcq.com/index/notice/detail/id/3607/cate_id/12.html，为机构向博物馆提供IP授权运营与文创开发能力，`supplier_to_institution`，KEEP。

## 数量重算

- formal_total：157（before 157；本阶段不新增/删除）
- exact_active：23
- closing_soon：14
- opening_soon：3
- long_term：6
- raw actionable_pool：43 → 43
- direction-aware ICH actionable_pool：43 → 40（剔除3条反向博物馆批发）
- channel_collaboration actionable：8 → 8
- supplier channel coverage：4
- procurement_project actionable：2

## Direction Gate 与 Batch4 技术债

新增 `verify-ich-stage5a-direction`：要求所有 channel_collaboration 记录存在 opportunity_direction；反向 wholesale 不得计入 supplier channel；官方禁止普通商业主体时不得保留 individual/enterprise/studio 申请类型。

Batch3 历史脚本仍保留 structuredClone(base) 以便审计复现；Batch4 gate 已建立，任何 `run-ich-stage5a-batch4.ts` 出现该模式都会失败。Batch4 必须使用显式 Opportunity 工厂或显式字段构造。

本次变更前 SHA-256：1bd114f982818a5c55feafe422c1ade252fb177b10908d8485f575eaf1aba644
本次变更后 SHA-256：8cc10b7ab24aac19e52764b77842ac6866a62c17a933b83e35d76304e6ab6ce9
字段变更数：2

## 决策计数

KEEP 6；RECLASSIFY 1；ICH_EXCLUDE 0；UNIVERSAL_POOL_ONLY 3

结论：Stage5-A.2 方向语义修复通过；可以进入 Batch4 的候选设计，但 Batch4 仍须先通过本方向门禁并采用显式机会工厂。
