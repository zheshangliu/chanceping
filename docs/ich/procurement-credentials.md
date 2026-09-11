# 采购来源凭证配置

本文只记录接入路径，不包含任何真实密钥。所有凭证必须通过运行环境注入，禁止写入 Git、fixture、审计 JSON 或截图。

## SAM.gov

1. 登录 SAM.gov，进入 Account Details / API Key 页面。
2. 按 Public API Key 流程申请并查看密钥。
3. 在运行环境设置 `SAM_GOV_API_KEY`。
4. 使用 `npm run run:ich:procurement:phase1`（或后续生产流程）进行 credential-aware smoke；未配置时只能报告 `FIXTURE_OK_LIVE_KEY_MISSING`，不得把 fixture 计入 live。

## KONEPS / data.go.kr

1. 登录 data.go.kr，打开对应 KONEPS OpenAPI 数据集页面。
2. 申请该 REST OpenAPI 的 일반 인증키（Service Key），按平台审批/自动审批结果启用。
3. 在运行环境设置 `KONEPS_SERVICE_KEY`。
4. 运行 credential-aware smoke；未配置时只能报告 `FIXTURE_OK_LIVE_KEY_MISSING`，不得把 fixture 计入 live。

## 安全边界

- 不提交 `.env`、shell history、CI 日志、截图或审计产物中的 secret。
- 不把缺少凭证写成“API 不可用”；状态必须区分 fixture 可用与 live 缺凭证。
