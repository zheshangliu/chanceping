# ChancePing 发布治理

## 单一可信来源

- 三台开发机分别使用自己的 GitHub 身份、独立分支和 Codex 工作区。
- `main` 是稳定代码线；过渡期生产仍可显式选择 `rescue/mvp-codex`。
- 禁止开发机直接上传文件、在生产机修改源码，或从脏工作区发布。
- 生产密钥只放在 GitHub `production` environment 和服务器 `/etc/chanceping/chanceping.env`，不放在开发机脚本或 Git 仓库。

## 合并与发布

1. 功能分支提交 Pull Request。
2. `ChancePing CI / MVP regression gates` 全部通过。
3. 部署、工作流和 `docs/deployment/` 变更由 CODEOWNER 审核。
4. 合并到受保护的稳定分支。
5. 人工触发 `Deploy production`，输入要发布的分支或 tag。
6. GitHub `production` environment 完成人工批准后，工作流才取得生产凭据。
7. Cloud Assistant 在服务器获取该 ref，解析成唯一 commit，并调用 `scripts/deploy-release.sh`。
8. 新版本安装到 `/opt/chanceping/releases/<utc>-<commit>`，健康检查通过后保留；失败自动切回上一版。
9. 公网 remote smoke 通过后才算发布完成。

生产发布使用 concurrency group `chanceping-production`，任何时刻只允许一个发布运行。

## GitHub 设置清单

在代码和工作流推送到 GitHub 后配置：

- 创建 environment：`production`。
- 为 `production` 增加 required reviewer，并启用 prevent self-review（计划支持时）。
- Environment secrets：`ALIBABA_CLOUD_ACCESS_KEY_ID`、`ALIBABA_CLOUD_ACCESS_KEY_SECRET`、`CHANCEPING_SWAS_INSTANCE`。
- Environment variable：`CHANCEPING_SWAS_REGION=cn-hongkong`。
- 保护 `main`：禁止直接 push，要求 Pull Request 和 `MVP regression gates`。
- 过渡期不要自动部署 `main`；生产发布只允许手动 `workflow_dispatch`。

## 服务器布局与回滚

```text
/opt/chanceping                 Git 镜像工作树，只用于 fetch/archive
/opt/chanceping/releases        不可变发布目录
/opt/chanceping/current         指向当前 release 的软链接
/opt/chanceping/shared          data/reports/exports 持久目录
/opt/chanceping/release-manifest.json
/etc/chanceping/chanceping.env  生产环境变量
```

`deploy-release.sh` 在切换前记录上一软链接。服务重启或 `/health` 失败时自动恢复上一链接并重启服务。脚本不会自动删除旧 release；清理策略应在成功运行一段时间后另行实施。

## 后续 OSS 交付层

当前第一阶段仍由服务器从 GitHub fetch 指定 ref。待 CI 稳定后，再把构建产物上传到阿里云 OSS，并让 Cloud Assistant 下载带 SHA-256 的发布包。GitHub 继续作为协作和版本真相，OSS 只承担国内发布包传输，不能替代 GitHub。
