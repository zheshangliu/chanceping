# ChancePing 阿里云 MVP 部署清单

本清单用于把当前本地 MVP 迁移到阿里云测试站。目标是先部署可演示版本：每个用户默认可进入内置「全球 AI 赛事导航」雷达，另可创建 3 个自定义雷达窗口；公开页 `/aievents` 只读取已入库赛事数据，不在访客访问时触发 live search 或 live LLM。

## 部署边界

- 不提交 `api.env`，不把任何 API Key 写进 Git。
- 生产环境默认不读取本地 `api.env`。
- `verify:all` 继续保持 mock-safe，不调用 live API。
- 参赛/阿里云演示 profile 使用 Qwen：`CHANCEPING_LLM_PROFILE=contest`，`CONTEST_LLM_PROVIDER=qwen`。
- 本地开发可以显式开启 live LLM / live search；生产开启策略必须由阿里云环境变量控制。
- 公开 AI Events 页面只展示数据库/本地 store 里的赛事卡，不直接调用 `/api/search` 或手动跑雷达。

## 必配环境变量

在阿里云环境变量管理处配置，值不写入仓库：

- `NODE_ENV=production`
- `DATA_MODE=mock` 或部署时选定的持久化模式
- `LLM_MODE=mock` 或部署时选定的 live 模式
- `CHANCEPING_LLM_PROFILE=contest`
- `CONTEST_LLM_PROVIDER=qwen`
- `CONTEST_LLM_MODEL`
- `CONTEST_LLM_BASE_URL`
- `CONTEST_LLM_API_KEY`
- `SERPER_API_KEY`

本地调试专用变量：

- `CHANCEPING_LOAD_API_ENV=true`
- `CHANCEPING_ENABLE_LOCAL_LIVE_SEARCH=true`
- `CHANCEPING_ENABLE_LOCAL_LIVE_LLM=true`

## 持久化与数据文件

部署前需要确认这些数据目录在目标环境有可写权限，或已经迁移到后续数据库实现：

- 雷达聊天窗口 store：`CHANCEPING_RADAR_CHAT_STORE_PATH`
- AI Events 数据源 store：当前公开页 `/api/public/ai-events` 使用的本地数据文件
- 自定义雷达、运行记录、机会卡和报告 artifact 的本地 data 目录

## 上线前本地闸门

```bash
node --run verify:q7:api-env-contest
node --run verify:q7:backend-i18n
node --run verify:q7:chat-window
node --run verify:q7:cloud-readiness
node --run verify:q7:aliyun-smoke
node --run verify:all
```

`verify:q7:aliyun-smoke` 会模拟两个不同用户：

- 每个用户都能打开内置「全球 AI 赛事导航」雷达；
- 每个用户最多创建 3 个自定义雷达窗口；
- 第 4 个自定义雷达窗口被阻断；
- 删除一个自定义雷达窗口后可以再创建；
- 内置雷达不占用 3 个自定义额度；
- 公开 `/aievents` 页面和 feed 能返回可展示赛事卡。

## 上线后手动验收

1. 打开 `/`，确认顶部 banner、左侧雷达入口和蓝色科技风正常。
2. 点击「全球 AI 赛事导航」，进入内置 AI 赛事雷达聊天窗口。
3. 点击发送内置提示词，确认只生成 V1.0 雷达，不要求新用户体验 V1.1/V1.2。
4. 点击盯机会，确认演示搜索进度出现，随后回到机会卡/报告摘要。
5. 打开「我的雷达」，确认内置 AI 赛事雷达显示为「全球 AI 赛事导航」。
6. 创建 3 个自定义雷达窗口，第 4 个应明确提示额度已满。
7. 删除一个自定义窗口，确认列表消失并释放额度。
8. 打开 `/aievents`，确认公开赛事导航展示当前有效赛事、历史赛事入口、分页、分类筛选和联系方式。

## 已知后续项

- 真正阿里云 URL smoke 尚未接入，需要部署后补一个远程 URL 版本检查脚本。
- 多雷达多窗口的长期上下文摘要还未完全实现。
- Qwen 与 DeepSeek 的质量对比另做独立实验，不放进当前阿里云前置闸门。
