# 盯非遗 V1.4 中文显示运行手册

## 运行边界

- `npm run opportunity:v2:display` 默认为 dry-run；它先生成目标/缓存/预算清单，不请求模型、不写翻译缓存。
- `npm run opportunity:v2:display:execute` 只调用运行时配置已授权的 DeepSeek；不启用或覆盖 `CHANCEPING_ENABLE_LOCAL_LIVE_LLM` / `CHANCEPING_ENABLE_PRODUCTION_LIVE_LLM`，不允许 Qwen 或其他 fallback。
- 运行前先核对 `CHANCEPING_OPPORTUNITY_V2_POOL_PATH`、`CHANCEPING_OPPORTUNITY_V2_SOURCES_PATH`、`CHANCEPING_OPPORTUNITY_V2_TRANSLATION_PATH` 指向预期的运行时副本。生产操作只能通过经授权的服务器端 runner 执行，不可从开发机把生产 JSON 当成本地缓存覆盖。
- 要加载本地 `api.env`，必须显式设置 `CHANCEPING_LOAD_API_ENV=true`；这不会打开 live-LLM 授权开关。

## 有界翻译合同

- 每次最多 200 个唯一机会；先检查可复用的成功缓存、cooldown 和 retryability，再选队列，因此缓存记录不能占满前 N 个槽位、饿死队尾。
- 每条记录最多 2 次真实 HTTP 请求；请求在网络调用前计入共享预算。全轮最多 250 次请求、最多 2 个并发、单次超时最多 30 秒。
- provider 固定 DeepSeek。授权配置缺失时返回 `ACCESS_BLOCKED`，不能回退 Qwen、模拟响应或写“翻译成功”。
- 译文按 source hash 校验后写入；当前原文已变、机会已删除、已有人工/成功译文时，迟到结果、失败结果或同版本重放不能覆盖当前成功结果。
- 标题与摘要分别验收；标题质量通过而摘要失败时，标题仍可用，摘要为空并记录字段级失败。模型 token 与账单用量当前无法由 adapter 获得，因此报告明确标记 unavailable，不估算。

## 运行步骤

1. 在隔离副本设置三个数据路径并执行 `npm run opportunity:v2:display`。
2. 检查输出报告中的输入路径、SHA-256、目标 ID、缓存重用数、eligible 队列和 provider 授权状态。默认产物为 `audits/ich/v14/latest/translation-run.json`；可用 `CHANCEPING_V14_TRANSLATION_RUN_PATH` 指定报告路径。
3. 若当前任务没有获准的 DeepSeek 运行身份，不执行 live 命令。获准运行才显式调用 `npm run opportunity:v2:display:execute`；该命令仍遵守既有 live-profile 门禁。
4. 检查 `status`、`actual_requests`、`write_result`、失败分类及输出哈希，然后在同一数据副本重新 dry-run，确认成功记录被 cache-reuse 而非重复调用。
5. 生产运行报告必须来自生产 runner 的实际 runtime 路径和执行回执。开发机影子结果不得标记成 production refresh。

## 本轮运行状态

2026-10-05 基线核验只读确认了公开抓取更新时间/下一次调度，但未找到获准的生产端翻译/刷新 runner；未执行生产翻译、生产数据写入或发布。请通过现有受保护运维渠道提供 runner/身份后，由值班操作者执行上述有界流程。不得粘贴部署密钥或 DeepSeek API key 到任务对话。
