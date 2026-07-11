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

推荐先跑一键 preflight：

```bash
node --run verify:q7:aliyun-preflight
```

它会依次执行类型检查、Qwen contest 环境检查、后端 Qwen 文案、聊天窗口数据层、Docker/readiness、阿里云本地 smoke、容器 smoke 和 `verify:all`。

如果当前机器没有 Docker，或 Docker Hub / 镜像源暂时不可用，可以显式跳过容器 smoke，先跑其余闸门：

```bash
CHANCEPING_SKIP_ALIYUN_CONTAINER_SMOKE=true node --run verify:q7:aliyun-preflight
```

分项排错命令：

```bash
node --run typecheck
node --run verify:q7:api-env-contest
node --run verify:q7:backend-i18n
node --run verify:q7:chat-window
node --run verify:q7:docker-readiness
node --run verify:q7:cloud-readiness
node --run verify:q7:aliyun-runbook
node --run verify:q7:aliyun-smoke
node --run verify:q7:aliyun-container-smoke
node --run verify:all
```

真实上云前，再跑一次部署前置条件检查：

```bash
node --run verify:q7:aliyun-deploy-prereqs
```

默认是 report-only 模式：它只检查本机/CI 是否已经具备 Docker、阿里云 CLI 或远程 URL、阿里云凭据变量名、ACR 镜像目标和远程 smoke URL，不会打印任何密钥值。

当你准备真正部署时，用严格模式阻断缺项：

```bash
CHANCEPING_REQUIRE_ALIYUN_DEPLOY_READY=true node --run verify:q7:aliyun-deploy-prereqs
```

当前机器如果缺少 `aliyun` CLI、ACR 目标、阿里云凭据或 `CHANCEPING_DEPLOY_BASE_URL`，严格模式会失败；这表示还不能声称已经可真实上云。

`verify:q7:aliyun-smoke` 会模拟两个不同用户：

- 每个用户都能打开内置「全球 AI 赛事导航」雷达；
- 每个用户最多创建 3 个自定义雷达窗口；
- 第 4 个自定义雷达窗口被阻断；
- 删除一个自定义雷达窗口后可以再创建；
- 内置雷达不占用 3 个自定义额度；
- 公开 `/aievents` 页面和 feed 能返回可展示赛事卡。

## 4.5 后端页面客户可见文案复核

在进入阿里云准备前，必须单独检查普通客户能看到的「盯机会」后端页面文案：

- 不出现 DeepSeek 字样；
- 不把 Qwen / Serper / LLM / provider 作为客户可见执行者；
- 需求理解 / 画像生成使用 `盯机会正在理解并生成雷达`；
- 雷达规格生成使用 `盯机会正在画雷达`；
- 搜索阶段使用 `盯机会正在搜索机会并整理证据`；
- 报告生成使用 `盯机会正在生成机会报告` 或 `盯机会正在生成报告`。

对应自动闸门：

```bash
node --run verify:q7:backend-i18n
node --run verify:q7:cloud-readiness
```

## 4.6 线上长搜索 10 分钟等待

自定义雷达的 live 搜索和报告生成可能需要数分钟。参赛内测阶段宁可让客户等待，也不要在 60 秒左右返回网关 HTML 错误页。SWAS / Nginx 代理应允许最长 10 分钟响应窗口：

```bash
sudo grep -R "proxy_pass.*3000\|127.0.0.1:3000\|localhost:3000" -n /etc/nginx/sites-enabled /etc/nginx/conf.d /etc/nginx/nginx.conf
sudo cp /etc/nginx/nginx.conf /etc/nginx/nginx.conf.bak.$(date +%Y%m%d%H%M%S)
sudo nginx -T | grep -n "proxy_read_timeout\|proxy_send_timeout\|proxy_connect_timeout" || true
```

在实际代理到 `chanceping.service` 的 `location` 或 `server` 配置中加入：

```nginx
proxy_connect_timeout 600s;
proxy_send_timeout 600s;
proxy_read_timeout 600s;
send_timeout 600s;
```

验证并重载：

```bash
sudo nginx -t && sudo systemctl reload nginx
```

注意：10 分钟同步等待适合当前 demo / 内测阶段。长期产品形态仍应升级为后台任务、进度轮询和报告完成通知，避免浏览器长连接成为唯一成功路径。

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

如果当前机器没有阿里云 CLI / ACR 凭据，仍可以先导出一个可交付给阿里云控制台或 CI 的镜像 tar：

```bash
node --run build:aliyun-image-tar
```

默认产物：

- `artifacts/aliyun/chanceping-aliyun-image.tar`
- `artifacts/aliyun/chanceping-aliyun-image.tar.json`

该 tar 来自 Dockerfile 和 `.dockerignore`，不应包含 `api.env`。真实 Qwen / Serper Key 仍只在阿里云环境变量中配置。上传或导入镜像后，继续设置测试站 URL 并运行远程 smoke：

```bash
CHANCEPING_DEPLOY_BASE_URL=https://your-aliyun-test-site.example.com node --run verify:q7:aliyun-remote-smoke
```

如果已经有阿里云 ACR 目标，可以直接从本机或 CI 构建并推送镜像：

```bash
CHANCEPING_ALIYUN_ACR_REGISTRY=registry.cn-hangzhou.aliyuncs.com \
CHANCEPING_ALIYUN_IMAGE=your-namespace/chanceping:ai-events-demo \
node --run deploy:aliyun-acr
```

可选变量：

- `CHANCEPING_ALIYUN_ACR_USERNAME` / `CHANCEPING_ALIYUN_ACR_PASSWORD`：需要脚本登录 ACR 时使用。脚本通过 `--password-stdin` 登录，不打印密码。
- `CHANCEPING_ALIYUN_IMAGE_TAG`：本地构建标签，默认 `chanceping:aliyun`。
- `CHANCEPING_DOCKER_NODE_IMAGE`：构建基础镜像，默认 `public.ecr.aws/docker/library/node:22-slim`。
- `CHANCEPING_ALIYUN_PUSH_MANIFEST`：推送记录 manifest，默认 `artifacts/aliyun/aliyun-acr-push-manifest.json`。

脚本会执行 build / tag / push，并写入本地 manifest。manifest 只记录镜像目标、image id、基础镜像和时间，不保存 ACR 密码或任何 API Key。推送完成后，在阿里云服务里使用该镜像并配置上面的 Qwen / Serper 环境变量，然后运行远程 smoke：

```bash
CHANCEPING_DEPLOY_BASE_URL=https://your-aliyun-test-site.example.com node --run verify:q7:aliyun-remote-smoke
```

## ECS 构建部署推荐路径

如果已经把代码推到 GitHub / Gitee / Codeup，推荐使用阿里云 ECS 控制台的「构建部署」功能，让阿里云从 Git 仓库拉代码并在 ECS 内执行部署脚本。该路径比本机 SSH 稳定，也比直接上云效 Flow / ACR 更轻，适合作为 Workbench 首次上线后的常用发布方式。

仓库内提供的部署脚本：

```bash
scripts/deploy-ecs-builddeploy.sh
```

在 ECS 构建部署任务中使用：

```bash
bash scripts/deploy-ecs-builddeploy.sh
```

该脚本默认要求在仓库根目录执行，会：

- 安装 Node.js 22、Nginx、rsync 和基础依赖；
- 使用 `CHANCEPING_NPM_REGISTRY`，默认 `https://registry.npmmirror.com`；
- 将当前 Git 工作区复制到 `/opt/chanceping/releases/<timestamp>`；
- 排除 `api.env`、`.env`、`node_modules`、`.git`、`artifacts`、搜索缓存和 Serper 预算文件；
- 将 `data/`、`reports/`、`exports/` 持久化到 `/opt/chanceping/shared`；
- 复用已有 `/etc/chanceping/chanceping.env`，没有时只创建安全默认模板；
- 重启 `chanceping.service`；
- 配置 Nginx：
  - `chanceping.com` / `www.chanceping.com` -> 后端「盯机会」；
  - `aievents.chanceping.com` -> 公开「全球 AI 赛事导航」。

ECS 构建部署任务建议配置：

- 代码源：GitHub / Gitee / Codeup 中的 ChancePing 仓库；
- 分支：当前测试分支，例如 `rescue/mvp-codex`，稳定后再切到正式分支；
- 构建/部署命令：`bash scripts/deploy-ecs-builddeploy.sh`；
- 执行用户：root，或具备 `apt-get`、`systemctl`、`nginx` 写入权限的用户；
- 首次执行后，在服务器上编辑 `/etc/chanceping/chanceping.env` 填入真实 Qwen / Serper Key，再重启服务；
- 不要在 Git 仓库、流水线日志或部署命令里填写 API Key。

如果部署任务拉取 GitHub 慢或不稳定，可以先用 Gitee / Codeup 镜像仓库；应用部署逻辑不需要改变。

## Workbench 手动上线 fallback

如果本地 SSH 因跨境链路或安全策略不可用，可以使用阿里云 Workbench 的浏览器远程连接完成首次部署。该路径不依赖本机直连 SSH，也不需要把 `api.env` 上传到服务器。

本地先生成 Workbench 源码包：

```bash
node --run build:aliyun-workbench-bundle
```

默认产物：

- `artifacts/aliyun-workbench/chanceping-workbench-YYYYMMDD-HHMMSS.tar.gz`
- `artifacts/aliyun-workbench/workbench-install.sh`
- `artifacts/aliyun-workbench/workbench-enable-https.sh`

该源码包会排除 `api.env`、`.env`、`node_modules`、`.git`、`artifacts`、搜索缓存和 Serper 预算文件，只带必要源码、公开赛事数据、雷达 store 和报告 artifact。真实 Qwen / Serper Key 只在服务器 `/etc/chanceping/chanceping.env` 里填写。

在 Workbench 里上传 `chanceping-workbench-*.tar.gz` 和 `workbench-install.sh` 到 `/tmp`，然后执行：

```bash
cd /tmp
chmod +x /tmp/workbench-install.sh
bash /tmp/workbench-install.sh /tmp/chanceping-workbench-YYYYMMDD-HHMMSS.tar.gz
```

安装脚本会：

- 安装 Node.js 22、Nginx 和基础依赖；
- 使用 `CHANCEPING_NPM_REGISTRY`，默认 `https://registry.npmmirror.com`，降低国内服务器依赖安装失败概率；
- 将版本部署到 `/opt/chanceping/releases/<timestamp>`，并把 `/opt/chanceping/current` 指向当前版本；
- 将 `data/`、`reports/`、`exports/` 迁移到 `/opt/chanceping/shared` 并用软链接持久化；
- 如果 `/etc/chanceping/chanceping.env` 不存在，创建安全默认模板；
- 创建 `chanceping.service` 并配置 Nginx：
  - `chanceping.com` / `www.chanceping.com` -> 后端「盯机会」；
  - `aievents.chanceping.com` -> 公开「全球 AI 赛事导航」。

安装后在服务器上检查：

```bash
systemctl status chanceping --no-pager
journalctl -u chanceping -n 120 --no-pager
curl -fsS http://127.0.0.1:3000/health
curl -I http://127.0.0.1:3000/aievents
nginx -t
```

如果要启用真实 Qwen / Serper，只在服务器编辑：

```bash
nano /etc/chanceping/chanceping.env
systemctl restart chanceping
```

不要把密钥写进仓库、聊天记录或上传包。

## AI Events 三天更新任务（SWAS / Workbench）

公开页 `/aievents` 不在访客打开页面时触发 live search 或 live LLM。AI Events 公共赛事库由后台定时刷新，当前默认节奏是每 72 小时跑一次：

- 读取现有 AI Events source network；
- 同步机会卡到本地机会库；
- 尝试补齐赛事封面图；
- 没有真实赛事图时回退到来源站点 logo / 平台占位图；
- 不打印 Qwen / Serper API Key。

仓库提供两个 systemd 模板：

```bash
docs/deployment/chanceping-ai-events-update.service
docs/deployment/chanceping-ai-events-update.timer
```

在 SWAS Workbench 中执行下面命令启用三天一次的更新任务：

```bash
cd /opt/chanceping/current
install -D docs/deployment/chanceping-ai-events-update.service /etc/systemd/system/chanceping-ai-events-update.service
install -D docs/deployment/chanceping-ai-events-update.timer /etc/systemd/system/chanceping-ai-events-update.timer
systemctl daemon-reload
systemctl enable --now chanceping-ai-events-update.timer
systemctl list-timers --all | grep chanceping-ai-events-update
```

如果想立即手动跑一次刷新：

```bash
systemctl start chanceping-ai-events-update.service
journalctl -u chanceping-ai-events-update.service -n 120 --no-pager
```

如果要临时停用三天更新：

```bash
systemctl disable --now chanceping-ai-events-update.timer
```

该任务实际执行：

```bash
npm run ai-events:update -- --collect-sources --source-max-links=12 --hydrate-images --image-limit=60
```

也可以在 Workbench 中直接手动执行同一命令排查问题：

```bash
cd /opt/chanceping/current
npm run ai-events:update -- --collect-sources --source-max-links=12 --hydrate-images --image-limit=60
```

刷新后可用下面命令确认公开页和 API 仍正常：

```bash
curl -fsS http://127.0.0.1:3000/api/public/ai-events?page_size=3 | head -c 500
curl -I http://127.0.0.1:3000/aievents
```

域名配置建议：

- `chanceping.com` -> ECS 公网 IP；
- `www.chanceping.com` -> ECS 公网 IP；
- `aievents.chanceping.com` -> ECS 公网 IP。

DNS 生效且 HTTP 验证通过后，再通过 Workbench 运行 HTTPS helper：

```bash
chmod +x /tmp/workbench-enable-https.sh
bash /tmp/workbench-enable-https.sh sunny251610056@gmail.com
```

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
- 客户可见页面不出现 DeepSeek / Qwen / Serper 等外部供应商执行者字样，并统一展示「盯机会」工作文案；
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
