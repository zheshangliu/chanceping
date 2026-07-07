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

可直接参考仓库内无密钥样例：

```bash
docs/deployment/aliyun.env.example
```

该文件只保存变量名和安全默认值，不保存真实 Key；复制到阿里云控制台后再手动填写 `CONTEST_LLM_API_KEY`、`SERPER_API_KEY` 等敏感值。

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
node --run verify:q7:aliyun-container-smoke
node --run verify:all
```

`verify:q7:aliyun-smoke` 会模拟两个不同用户：

- 每个用户都能打开内置「全球 AI 赛事导航」雷达；
- 每个用户最多创建 3 个自定义雷达窗口；
- 第 4 个自定义雷达窗口被阻断；
- 删除一个自定义雷达窗口后可以再创建；
- 内置雷达不占用 3 个自定义额度；
- 公开 `/aievents` 页面和 feed 能返回可展示赛事卡。

## 4.5 后端页面 Qwen 文案复核

在进入阿里云准备前，必须单独检查普通客户能看到的「盯机会」后端页面文案：

- 不出现 DeepSeek 字样；
- 需求理解 / 画像生成使用 `Qwen 正在理解并生成雷达`；
- 雷达规格生成使用 `Qwen 正在画雷达`；
- 搜索阶段使用 `Serper 正在搜索机会，Qwen 随后整理证据`，不把网页搜索说成由 Qwen 执行；
- 报告生成使用 `Qwen 正在生成机会报告` 或 `Qwen 正在生成报告`。

对应自动闸门：

```bash
node --run verify:q7:backend-i18n
node --run verify:q7:cloud-readiness
```

## 容器 / 阿里云运行时准备

如果阿里云测试站使用容器部署，先本地检查 Docker 工件：

```bash
node --run verify:q7:docker-readiness
```

容器部署约束：

- `api.env` 不进入镜像，也不挂载到生产容器；
- 默认 `NODE_ENV=production`，且 `LLM_MODE=mock` / `DATA_MODE=mock`，避免未配置密钥时误触发 live API；
- 参赛 profile 明确为 `CHANCEPING_LLM_PROFILE=contest` 和 `CONTEST_LLM_PROVIDER=qwen`；
- 真实 Qwen / Serper Key 只通过阿里云环境变量注入；
- `data/`、`reports/`、`exports/` 需要挂载持久化卷，确保雷达窗口、机会卡和报告刷新后仍在。

如果本地或 CI 构建镜像时拉取 `node:22-slim` 超时，优先处理 Docker Registry 网络问题，而不是改应用代码：

- 配置 Docker Hub 镜像加速或公司/阿里云容器镜像服务 ACR mirror；
- 或直接在阿里云 ACR / 云构建环境执行构建；
- 如果需要替换基础镜像，使用 build arg，不要改 Dockerfile：

```bash
CHANCEPING_DOCKER_NODE_IMAGE=node:22-slim
docker build \
  --build-arg NODE_IMAGE="$CHANCEPING_DOCKER_NODE_IMAGE" \
  -t chanceping:aliyun .
```

使用 Docker Compose 时可设置：

```bash
CHANCEPING_DOCKER_NODE_IMAGE=node:22-slim docker compose build
```

如果你配置了阿里云 ACR 中转镜像，把 `node:22-slim` 替换成对应 ACR 镜像地址即可。

如果要把“构建镜像 → 启动临时容器 → 用远程 smoke 验证容器”合并成一条本地闸门，可运行：

```bash
node --run verify:q7:aliyun-container-smoke
```

该脚本会：

- 使用 `docker compose build` 构建 `chanceping:latest`；
- 如果本机没有显式设置 `CHANCEPING_DOCKER_NODE_IMAGE`，但已有可用的 `public.ecr.aws/docker/library/node:22-slim` 本地镜像，会优先复用它，避免 Docker Hub 网络问题；
- 启动临时容器并等待 `/health`；
- 自动设置 `CHANCEPING_DEPLOY_BASE_URL=http://127.0.0.1:<临时端口>`，复用 `verify:q7:aliyun-remote-smoke` 验证容器；
- 结束后自动停止临时容器。

如果阿里云或 CI 使用 ACR 中转镜像，可显式指定：

```bash
CHANCEPING_DOCKER_NODE_IMAGE=registry.cn-hangzhou.aliyuncs.com/your-namespace/node:22-slim \
  node --run verify:q7:aliyun-container-smoke
```

构建成功后仍需运行部署后的远程 smoke。

## 部署后远程 smoke

部署完成并拿到测试站 URL 后运行：

```bash
CHANCEPING_DEPLOY_BASE_URL=https://your-aliyun-test-site.example.com node --run verify:q7:aliyun-remote-smoke
```

如果需要在 CI 中强制要求远程 URL：

```bash
CHANCEPING_DEPLOY_BASE_URL_REQUIRED=true node --run verify:q7:aliyun-remote-smoke
```

远程 smoke 会检查：

- `/health` 可用；
- 首页、后端脚本、`/aievents` 均可访问；
- 客户可见页面不出现 DeepSeek 字样，并展示 Qwen 工作文案；
- `/api/public/ai-events?page_size=8` 返回赛事卡且不泄露内部 key / run id；
- 一个新用户可以打开内置「全球 AI 赛事导航」，并创建 3 个自定义雷达窗口；
- 第 4 个自定义雷达窗口被阻断，删除一个窗口后释放额度。

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

- 远程 smoke 需要真实阿里云测试站 URL 才能执行完整检查。
- 多雷达多窗口的长期上下文摘要还未完全实现。
- Qwen 与 DeepSeek 的质量对比另做独立实验，不放进当前阿里云前置闸门。后续可在本地显式运行：

```bash
node --run compare:live-llm-profiles
```

该脚本会用固定的需求理解、结果反馈、报告解释提示词对比 `commercial / DeepSeek` 与 `contest / Qwen`，只记录 profile / provider / model、延迟、输出长度、JSON 字段形状和脱敏预览，不记录任何 API Key。
