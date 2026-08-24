# DS1-A 来源端点核验报告 V1.0

## 1. 核验范围

- 核验对象：`src/ich/source-registry.v2.json` 中登记的 31 个来源。
- 核验方式：对 `canonical_url` 发起只读 `GET`，跟随重定向；不执行表单提交、搜索写入、登录、抓取入库或生产发布。
- 工具：`scripts/verify-ich-source-endpoints.ts`。
- 记录文件：[DS1-A-来源端点核验记录_V1.0.json](/Users/1sunflower/Documents/chanceping/docs/ich/DS1-A-来源端点核验记录_V1.0.json)。
- 执行命令：

```bash
npm run typecheck
npm run verify:ich:source-registry:v2
npm run verify:ich:source-endpoints -- --timeout-ms 15000 --concurrency 6
```

## 2. 结果摘要

本次共记录 31/31 个端点，故“端点均有状态记录”通过；但不能把端点可达性等同于已具备自动采集能力。

| 项目 | 结果 |
|---|---:|
| HTTP 200 | 26 |
| HTTP 403 | 2 |
| 网络错误/超时 | 3 |
| 列表型页面（启发式判断） | 19 |
| 搜索型页面（按注册访问模式或查询 URL） | 4 |
| 首页/落地页（启发式判断） | 2 |
| 未能可靠判断页面类型 | 1 |
| 需要后续处理的来源 | 6 |
| DS1-A 门禁 | `pass_with_followups` |

页面类型、动态渲染和重定向判断中标记为 `INFERENCE` 的内容只是端点层启发式信号，不是机会字段事实。

## 3. 后续处理来源

以下来源仍保持 `operational_status=planned`，不得宣称已自动接入：

| 来源 ID | 当前结果 | 处理建议 |
|---|---|---|
| `gz-ggzy` | 无 HTTP 响应；域名解析失败 | 在采集运行环境复核 DNS；确认后再设计搜索适配器 |
| `sz-culture` | 本次脚本出现网络错误，独立只读请求曾返回 200 | 作为瞬时网络异常复测；未复测前保持 planned |
| `chinaich` | 连接超时 | 增加更长超时或人工/manual 访问路径；不绕过限制 |
| `gz-museum` | 200，但落到首页且响应很小，动态信号为 true | 需要浏览器/人工确认具体公告入口；首页不能直接作为机会详情页 |
| `crafts-council-uk` | 403，页面要求 JavaScript | 不绕过反爬；评估官方 RSS、站点地图或人工发现路径 |
| `transartists` | 403，页面要求 JavaScript | 不绕过反爬；评估官方替代入口或人工发现路径 |

另有 `cnaca`、`cnicif` 的 200 首页/落地页或动态壳，不能据此认定存在可稳定分页的机会列表；进入 DS1-B 前应补充具体列表页或将访问模式改为 `manual`/`discovery_only`。

## 4. 门禁结论

### 已通过

- 31 个注册来源均有一次可审计的 HTTP/错误结果；
- 结果包含最终 URL、状态、内容类型、响应大小、页面类型启发式、JavaScript 信号和分页信号；
- 403、超时、域名解析失败和动态首页均被显式列为后续项；
- 未修改机会库、候选集、DNS、环境变量或部署配置；
- 未把任何来源状态改成 `adapter_ready`。

### 尚未通过

- 不能声称 31 个来源全部可稳定访问；
- 不能声称 31 个来源全部拥有稳定列表/搜索分页；
- 不能进入批量正式采集或 DS1-D 受控发布；
- 6 个后续来源需要复测、替代入口或人工路径设计。

**DS1-A 结论：有条件通过（`pass_with_followups`）。** 可以开始 DS1-B 的小样本适配设计，但仅限可达且页面结构足够明确的来源；异常来源必须先进入人工/替代入口队列，不得绕过 DS0 语义门禁。

## 5. 本轮未修改证明

- 只新增端点核验脚本、npm 验证命令和本报告/JSON 记录；
- 未修改 `src/ich/opportunities.verified.json`、正式机会库或候选机会数据；
- 未运行抓取入库、导入、数据库写入或部署命令；
- 工作树中的其他既有未跟踪文件保持原样，未被清理或覆盖。
