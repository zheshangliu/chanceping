# 非遗机会雷达阶段 4：SEO 与来源提交技术设计 V1.0

状态：已审阅批准，作为阶段 4 实施基线

基线：`ich/ich/11_非遗机会雷达_系统技术设计_V1.0.md`

编制日期：2026-07-24

## 1. 阶段定位

阶段 4 严格沿用已批准系统技术设计中的定义：

- 完善 metadata、Open Graph、JSON-LD、sitemap 和 robots；
- 建立安全的来源提交入口与人工审核队列；
- 建立首批官方来源登记表；
- 不实现自动抓取；
- 不让用户提交内容直接进入公开机会库；
- 不改变阶段 3 已上线的 `draft → pending_review → approved → published` 发布门禁。

真实数据批量整理、六类覆盖、浏览器 E2E 和上线准备属于阶段 5。

## 2. 成功标准

阶段 4 完成时必须满足：

1. `/ich`、`/ich/history` 和公开详情页具有稳定 canonical、description、OG 和 Twitter metadata；
2. 公开详情页输出与页面可见内容一致的 JSON-LD；
3. `/ich/sitemap.xml` 只包含已存在、可公开、可索引的页面；
4. `/ich/robots.txt` 明确允许公开页并禁止 `/ich/admin`；
5. 来源提交接口有请求体限制、URL 安全检查、限流、蜜罐和固定错误响应；
6. 提交数据只进入独立审核队列，不进入 `IchOpportunityStore`；
7. 管理员可将通过核验的提交转换为 `draft`，后续仍走阶段 3 审核发布；
8. 公共 GET 不写文件、不触发外部请求；
9. AI Events、V1.5、V1.6 和 ICH 阶段 1—3 回归全部通过。

## 3. 路由设计

### 3.1 公开 SEO 路由

| 路由 | 方法 | 行为 |
|---|---|---|
| `/ich` | GET | 当前机会 SSR 列表 |
| `/ich/history` | GET | 历史机会 SSR 列表 |
| `/ich/opportunities/:slug` | GET | 公开详情 SSR |
| `/ich/sitemap.xml` | GET | 纯读生成 sitemap |
| `/ich/robots.txt` | GET | 固定 robots 文本 |
| `/ich/submit` | GET | 来源提交表单 |
| `/api/public/ich/submissions` | POST | 接收来源线索，不抓取 URL |

### 3.2 内部审核路由

| 路由 | 方法 | 行为 |
|---|---|---|
| `/api/internal/ich/submissions` | GET | 分页读取提交队列 |
| `/api/internal/ich/submissions/:id` | GET | 查看提交详情 |
| `/api/internal/ich/submissions/:id/reject` | POST | 拒绝并记录理由 |
| `/api/internal/ich/submissions/:id/accept` | POST | 转换为机会草稿 |

内部路由继续复用 `CHANCEPING_ICH_ADMIN_TOKEN` Bearer 鉴权。接受操作必须原子完成：

1. 先写入可恢复事务日志；
2. 创建 `IchOpportunity` 草稿并写入机会审计历史；
3. 将 submission 标记为 accepted 并记录生成的 opportunity id；
4. 完成后删除事务日志；
5. 任一步失败都执行补偿回滚；进程中断后由恢复流程依据事务日志收敛状态。

## 4. 来源提交模型

建议新增独立 `IchSourceSubmission`，不得复用公开机会模型：

```ts
type IchSourceSubmissionStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "duplicate"
  | "spam";

interface IchSourceSubmission {
  id: string;
  source_url: string;
  title_hint: string | null;
  note: string | null;
  contact_email: string | null;
  status: IchSourceSubmissionStatus;
  normalized_url_hash: string;
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
  reviewer: string | null;
  review_reason: string | null;
  opportunity_id: string | null;
  request_fingerprint: string;
}
```

本地开发存储文件默认为 `data/ich-source-submissions.json`；生产环境默认使用
`/var/lib/chanceping/ich/ich-source-submissions.json`，避免 release 切换导致审核队列丢失。
可通过 `CHANCEPING_ICH_RUNTIME_DIR` 或更具体的 store/transaction 路径变量覆盖。
来源提交仍与 `data/ich-opportunities.json` 隔离，写入沿用临时文件、fsync、rename 和备份策略。

公开 API 永不返回：

- 联系邮箱；
- request fingerprint；
- reviewer；
- review reason；
- 内部 opportunity id；
- 服务端错误细节。

## 5. 提交安全设计

### 5.1 输入约束

- 请求体上限 16 KiB；
- `source_url` 必填，最长 2048；
- 只允许 `https:`，首版不接受其他协议；
- `title_hint` 最长 300；
- `note` 最长 2000；
- `contact_email` 最长 254，可选；
- 拒绝 URL 中的用户名、密码和非法端口；
- 标准化 URL 后做重复判断。

### 5.2 SSRF 边界

提交请求只保存 URL 字符串，不访问该 URL。审核页面也不得由服务端自动预览。

阶段 5 若增加抓取，必须另行实现：

- DNS 解析后阻止 loopback、私网、链路本地及保留地址；
- 每次重定向重新校验；
- 限制响应大小、超时和重定向次数；
- 禁止 `file:`、`ftp:`、`data:`、`javascript:` 等协议。

### 5.3 滥用保护

- IP/UA 派生的 HMAC fingerprint，不保存明文 IP；
- 单 fingerprint：10 分钟最多 3 次、24 小时最多 10 次；
- 全局速率保护；
- 隐藏蜜罐字段；
- 最短表单停留时间；
- URL hash 幂等去重；
- 所有错误返回固定 code，不返回堆栈；
- `Cache-Control: no-store`；
- 不向用户确认某个 URL 是否已在内部队列中。

## 6. SEO 设计

### 6.1 Metadata

- canonical 使用 `https://ich.chanceping.com`；
- 列表页 title、description 固定且稳定；
- 详情页 description 来源于已审核 summary；
- OG URL 与 canonical 完全一致；
- 未发布、撤回、归档和不存在页面不得出现在 sitemap；
- 管理页和提交成功页使用 `noindex,nofollow`。

### 6.2 JSON-LD

详情页首版使用 `WebPage` + `BreadcrumbList`，避免把所有机会误标为 `Event`。

只有同时存在明确活动时间、活动地点且机会本身确为活动时，后续才允许增加
`Event`。JSON-LD 字段必须来自公开序列化结果，不得暴露内部审核信息。

### 6.3 Sitemap

- 固定包含 `/ich`、`/ich/history` 和来源原则页；
- `/ich/submit` 路由在 4B 上线后加入；
- 动态包含 `is_published=true` 的详情页；
- `lastmod` 使用公开记录的 `updated_at`；
- 输出前去重；
- GET 只读，不生成或修改磁盘缓存；
- 响应使用 XML content type 和短时公共缓存。

### 6.4 Robots

建议内容：

```text
User-agent: *
Allow: /ich
Disallow: /ich/admin
Disallow: /api/internal/

Sitemap: https://ich.chanceping.com/ich/sitemap.xml
```

robots 不是安全控制。内部 API 仍必须通过 Bearer Token 鉴权。

## 7. 来源登记与机会提交的关系

首批官方来源登记表是人工运营清单，不是自动抓取配置：

- 来源登记表标记机构、域名、等级、覆盖地区和机会类型；
- 人工发现具体机会后，可以从内部后台创建草稿；
- 外部用户只能提交具体 URL；
- submission 被接受后才转换为 `draft`；
- `draft` 仍需提交审核、批准和发布；
- 来源等级由审核员根据实际页面判定，不根据域名自动授予。

## 8. 实施拆分

### 4A：SEO 基础

- 统一 absolute canonical；
- OG/Twitter metadata；
- JSON-LD；
- sitemap；
- robots；
- SEO 回归测试。

### 4B：提交队列

- submission types、validation、store；
- 公开 POST；
- 限流、蜜罐、幂等；
- 内部只读和审核 API；
- admin 页面队列；
- 接受后转 draft 的原子操作。

### 4C：回归与浏览器验收

- SSR 源码检查；
- sitemap 与 robots；
- XSS、SSRF、超大请求、重复提交；
- 匿名内部 API；
- 接受、拒绝、重启持久化；
- AI Events 与 MVP 主链路回归。

三个子阶段分别提交，任何子阶段均可独立回滚。

## 9. 测试矩阵

至少新增 `npm run verify:ich:stage4`，验证：

- canonical/OG/JSON-LD 一致；
- JSON-LD 可解析且不含内部字段；
- sitemap 只含公开记录；
- robots 禁止管理路径；
- GET 不写文件；
- 提交接口拒绝非 HTTPS、超大请求和危险 URL；
- 提交接口不发起网络请求；
- 重复提交保持幂等；
- 匿名不能读取审核队列；
- 正确管理员令牌可审核；
- accepted submission 生成 draft 而非 published；
- draft 不出现在公开 API/SSR/sitemap；
- 重启后 submission 和关联关系仍在。

每次修改继续运行：

```bash
npm run typecheck
npm run verify:ich:stage1
npm run verify:ich:stage2
npm run verify:ich:stage3
npm run verify:ich:stage4
npm run verify:v15:e2e
npm run verify:v15
npm run verify:v16
npm run verify:all
```

## 10. 明确不在本阶段

- 自动抓取和定时任务；
- AI 自动补全事实字段；
- 自动发布；
- 邮件通知和 webhook；
- 用户账号体系；
- 数据库迁移；
- 大规模来源接入；
- DNS、Nginx 或 systemd 改造。

## 11. 阶段 4 完成门槛

- 4A、4B、4C 全部验收通过；
- 至少 3 条测试 submission 完成 pending、rejected、accepted 路径；
- accepted 记录成功进入阶段 3 的 draft；
- 所有公开 GET 保持纯读；
- 生产环境未出现匿名写入或内部数据泄露；
- 经产品负责人审阅后，才进入阶段 5 真实数据整理。
