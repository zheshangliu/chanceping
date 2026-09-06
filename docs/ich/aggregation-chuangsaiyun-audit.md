# 创赛云赛事列表技术可抓取性审计

审计日期：2026-09-06（Asia/Shanghai）
来源 ID：`chuangsaiyun-competition-list`
来源页：<https://www.chuangsaiyun.com/#/diy?id=150>

## 结论

**P0_ACTIVE（技术抓取门禁通过，业务仍是 discovery_source）**。

创赛云入口是 Hash Router / Nuxt SPA，不能把入口 HTML 当作赛事列表。只读核验发现公开链路如下：

```text
GET https://www.chuangsaiyun.com/#/diy?id=150       200（Nuxt/Vue shell）
  -> POST https://m.chuangsaiyun.com/public/index.php/api/pc/diy
       id=150, user_id=0, deviceType=pc, version=4.8.1
       2004 / 成功；返回 4 个 iframe 配置
  -> GET https://www.xiacansai.com/mrjs.html           200（赛事卡片 HTML）
  -> 公开 articleInfo 接口可按 article ID 读取详情
```

适配器使用最后一个公开列表响应进行结构化解析；不模拟滚动、点击或登录。`diy` 接口仅负责发现列表 iframe，赛事卡片本身不在入口 JSON 中。

## 门禁核验

| 门禁 | 结果 | 证据 |
| --- | --- | --- |
| 页面可访问 | 通过 | 入口 GET HTTP 200；公开 `diy` POST HTTP 2004；列表 GET HTTP 200 |
| 无需认证 | 通过 | 使用 `user_id=0`、公开版本参数即可返回；未要求登录、Token 或 CAPTCHA |
| 结构化数据可重复获取 | 通过 | `mrjs.html` 连续两次：101,310 bytes，SHA-256 `81fc0afda78e118d37cf30db46ad2bf7d9051c05fae66a6458f577b4fd82522f` |
| 稳定 competition ID | 通过 | 赛事卡片 `data-url-pc`/`data-url-h5` 含稳定 `article?id=<number>`；本次 107 张卡片、103 个唯一 ID |
| 关键字段 | 部分通过 | 标题、分类、截止时间、状态、详情链接均存在；列表没有 organizer_text、published_at，按未确认处理 |
| 分页 | 未发现 | 列表为一次性生成的 107 张卡片、7 个年月分组；未发现 page/pageSize/currentPage XHR。是否存在后台分页接口未确认 |
| 有效候选 | 通过 | 107 张卡片中 32 条命中非遗/文创/文旅/文博等 ICH 关键词；仍必须回溯主办方官方详情页 |

## 字段映射

| 要求字段 | 来源位置 | 当前处理 |
| --- | --- | --- |
| `source_item_id` | `data-url-pc` 或 `data-url-h5` 的 `id` | 提取 article ID；优先 PC 链接 |
| `title` | `.tl-title` | HTML 解码后提取 |
| `category` | `.tl-meta` 中 `·` 后文本 | 映射到 `source_category` |
| `deadline` | `.tl-meta` 中 `截止时间：` | 提取文本并解析；原时区未由列表声明，未知不猜测 |
| `status` | `.tl-header` 的首个状态 `<span>` | 保存为 `source_status`，本次为“报名中” |
| `detail_url` | `data-url-pc` / `data-url-h5` | 保留 Hash Router 路由和 article ID |
| `organizer_text` | 列表未提供 | `null`，等待官方详情页回溯 |
| `published_at` | 列表未提供 | `null`，不推断 |

## 与设计竞赛网的交叉去重

创赛云和 `shejijingsai-list` 均为发现源，不能直接作为 L1 正式来源。聚合条目在标题 + 截止时间（有主办方时再加主办方）一致时共享一个跨源 identity，并合并 `discovered_by_sources`；不同来源的详情 URL 不会制造重复候选。官方主办方详情页仍是唯一可发布依据。

贡献统计在运行报告中分别列出：

- `shejijingsai-list`：`docs/ich/aggregation-shejijingsai-report.md`
- `chuangsaiyun-competition-list`：`docs/ich/aggregation-chuangsaiyun-report.md`

## 风险与未确认项

1. 入口 `diy` 配置引用的 `mrjs.html` 是公开 HTML 快照，当前未发现分页参数；后续需持续监测页面是否改为分页或需要新的接口。
2. 列表只有聚合信息；主办方、申请入口、原始截止时间和时区必须在官方详情页确认，不能因“报名中”直接发布。
3. 同一卡片的 PC/H5 路由偶尔出现不同 article ID；适配器优先 PC ID，并在详情回溯时记录冲突，不自动合并成两个机会。

## 状态判定

```text
P0_STATUS = P0_ACTIVE
ROLE = discovery_source
AUTH = NOT_REQUIRED_CONFIRMED
LIST_FORMAT = PUBLIC_EMBEDDED_HTML
OFFICIAL_BACKTRACE = REQUIRED_BEFORE_PUBLISH
FORMAL_IMPORT = NOT_PERFORMED
```
