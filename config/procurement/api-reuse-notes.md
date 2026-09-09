# API、开放数据与开源复用路线

研究日期：2026-09-09。这里区分“官方文档证明存在”与“已运行接口”；本次没有拿用户密钥调用采购API，也没有配置新外部账号。

## 1. 优先复用次序

正式公开API／公开数据文件 → 正式RSS → 专用列表/详情解析 → 需要JS的公开页面 → 搜索索引辅助发现。受账号、收费、复用许可限制的来源，记录限制并继续其他来源；不接入隐藏接口，不突破验证。

## 2. TED（欧盟）

官方说明：https://docs.ted.europa.eu/api/latest/search.html
批量模式：https://docs.ted.europa.eu/ODS/latest/reuse/search-api.html

正式操作是 `POST /v3/notices/search`，官方明确搜索API面向数据复用者且不要求认证。执行者从正式Swagger核实主机、字段、查询语法后再做实时测试；已公开主机为 `https://api.ted.europa.eu`。请求支持 query、fields、page、limit、scope、checkQuerySyntax、paginationMode、iterationNextToken。不要把发公告的eSender认证要求混到搜索接口。

分页模式一次查询至多可提取15000份公告，单页最多250；大结果集用ITERATION和返回的游标，不能到15000就宣称抓全。文化对象关键词与CPV要结合；国家来源与NUTS履行地分别存。

## 3. 英国 Find a Tender / Contracts Finder

官方说明：https://www.gov.uk/government/publications/open-contracting
FTS接口：https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages
文档：https://www.find-tender.service.gov.uk/apidocumentation/1.0/GET-ocdsReleasePackages

按公开OCDS release package接入；用日期、公告阶段、notice/ocid过滤。Contracts Finder也提供OCDS输出；沿当前政府说明取得实际端点，不凭记忆拼旧API。保留release版本与tender/award等阶段，不把每个release当一个新订单。英国四地与低额来源仍需单独覆盖。

## 4. 美国 SAM.gov

官方：https://open.gsa.gov/api/get-opportunities-public-api/
接口：`GET https://api.sam.gov/opportunities/v2/search`

必须设置用户授权的API key；没有key则明确 `CREDENTIAL_NOT_CONFIGURED`，不能报免费匿名抓取成功。依据文档设置postedFrom/postedTo和页/offset，时间跨度等参数限制需实测。active/latest与归档的范围不同；联邦source不等于50州、地方学校采购全量。

## 5. 加拿大 CanadaBuys

公开采购数据入口以官方数据目录为准：
- https://open.canada.ca/data/dataset/6abd20d4-7a1c-4b38-baa2-9525d0bb2fd2
- Open tenders资源：https://open.canada.ca/data/dataset/6abd20d4-7a1c-4b38-baa2-9525d0bb2fd2/resource/5870de7c-86fe-4d05-8d73-cd412e12fdeb
- New tenders资源：https://open.canada.ca/data/dataset/6abd20d4-7a1c-4b38-baa2-9525d0bb2fd2/resource/05b804dd-11ec-4271-8d69-d6044e1a5481

沿资源Download的真实链接读UTF-8 CSV；识别英语/法语标题并合并同项目，处理BOM、逗号、引号、多行。目录资源更新时间不等于每条项目仍开放；读取状态与截止。先做表头schema检查，不能把HTML错误页当CSV。省区用04矩阵继续。

## 6. 法国 BOAMP

正式数据集：
- https://www.boamp.fr/explore/dataset/boamp/api/
- https://www.boamp.fr/explore/dataset/boamp/export/

使用正式 `boamp` 数据集，不用 `preprod`、`developpement` 或权限受限的内部HTML数据集。API参数从实时说明取得。避免把历史成交自动当正在投标。

## 7. ChileCompra / PNCP / 韩国等

ChileCompra文档：https://www.chilecompra.cl/api/
PNCP：https://www.gov.br/pncp/pt-br
韩国KONEPS：https://www.g2b.go.kr/

各自先检查正式开放API及凭据。韩国“修改时间很新”的旧数据集可能只覆盖到2025年，必须检查数据的实际时间范围和替代接口。智利接口有凭据/票据约定时尊重约定；不能因为官方提供API就假定无限匿名。

## 8. OCP 与 Kingfisher

数据注册表：https://data.open-contracting.org/
Kingfisher文档：https://kingfisher-collect.readthedocs.io/en/latest/
变更历史：https://kingfisher-collect.readthedocs.io/en/latest/history.html

适合发现标准化数据源、参考下载器与OCDS字段映射。复用代码前检查对应仓库LICENSE及最新维护状态；不要求为了接采购模块另部署一套Kingfisher全栈。

重要：历史页记录了若干国家/地区采集器因接口变化而移除（包括旧哥伦比亚、墨西哥及其他入口）。不能复制老spider就报成功。数据集里出现某国家，不证明截至研究日持续更新。

## 9. 不要复制的错误捷径

- 不把百度/Google搜索摘要直接当完整采购正文。
- 不把私人招标平台的隐藏联系人、会员全文或付费API绕过后再发布。
- 不假定公开网页或开源代码等于所有内容可无限镜像转售；检查复用条款，保留来源深链接，摘要/关键字段优先。
- 不因某来源403、521、CAPTCHA而拖停全部来源。
- 不根据网址长度、首页含“采购”两个字就认定存在稳定公告源。
- 不复用比赛用的“未来日期胜过过去日期”或“投稿截止永远最高优先级”来计算采购可行动状态。
