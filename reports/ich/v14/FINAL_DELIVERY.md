# 盯非遗 V1.4｜可信运营与行动闭环最终交付

## 1. 给用户的结论

- 状态：**ACCESS_BLOCKED**（候选实现与隔离验收已完成，生产中文刷新、私有跟进及受保护发布尚未完成）。
- 线上地址：[盯非遗机会雷达](https://ich.chanceping.com/ich)。
- 本轮用户实际新增：候选代码加入有界增量翻译运行、来源许可/新鲜度治理、证据与截止语义展示、最多10条行动清单、语义变化与用户私有待办；伪造身份访问在候选代码中 fail-closed。生产尚未更新这些改动。
- 尚未完成及影响：线上翻译/抓取未执行；线上跟进 API 已观察到伪造 `x-business-user` 请求 HTTP 200；生产还没有经验证的服务端终端用户身份，也没有已授权的 runtime refresh/translation runner。用户尚不能把候选私有跟进/inbox 当成已上线功能。

## 2. 版本与运行

- 观测时间：2026-10-05 UTC / 2026-10-06 Asia/Shanghai。
- `origin/main` 起始 SHA：`615680cbf6ff9b1fe2a083a56ec542944e6da910`。
- 生产报告 SHA / release：`0174f78f323a739bd430f755988159575e660347` / `20260919T022422Z-0174f78f323a`（部署证据核验值；公开 `/health` 只报告版本 `1.3.0`，不能独立证明当前服务器 commit）。
- 合流基线 `53b4cf5beedca33a283eb2cc37699de31e802cc1`；生产线当时领先5、main领先2。仅选择性移植4个生产修复提交，无整支 rescue 合并；`main` 未直接修改，未强推，生产 runtime 未写。
- V1.4 候选分支：`codex/ich-v14-trusted-operations`；M0 `bdb2a7d`、M1 `15a426a`、M2 `6a6e59f`、M3 `5e103c1`。M4 报告/审计提交、push 与 PR 状态见本轮 Git 回报。
- 合法生产作业入口：未找到。`POST /api/opportunity-v2/run` 返回 `403 FORBIDDEN`（“需要后台权限”）；这只能证明本次调用没有有效调用者权限，不能据此推断服务端 secret 未配置。现有受保护 deploy workflow 不是 runtime 抓取/翻译 runner。
- 生产实际执行：本轮只读 HTTP/API 审计；**抓取0、DeepSeek请求0、翻译写入0、生产文件写入0**。生产截图与候选本地预览截图分别标注。
- 72h：公开来源总览给出的下次时间 `2026-10-07T06:20:16.531Z`（上海时间 10-07 14:20:16）。timer 的 systemd enabled/active 状态和近7天日志不能从公开 API 验证；不将计划时间写成实际触发证明。

## 3. 中文结果（分清集合）

生产只读基线在本轮没有变化，故没有生产“前后提升”可报告。

| 生产公开集合 | 可见外文标题候选 | 当前渲染为中文 | 当前待处理/其他 | 本轮新请求/写入 |
|---|---:|---:|---:|---:|
| 赛事 + 海外当前页 | 5 | 5 | 0 | 0 / 0 |
| 采购当前页 | 8 | 3 | 5 pending | 0 / 0 |
| Memo JSON 可见项 | 54 | 54 | per-ID 私有失败码不可见 | 0 / 0 |
| 原始公开 Radar API | 89个外文标题候选 | 不等同于页面渲染率 | sidecar不公开 | 0 / 0 |

- 历史冻结集：旧报告的477条（399合格、78失败）只作参照；精确 ID 与生产私有 sidecar 无法恢复，不能计算可比的逐ID前后值。
- 隔离 worktree dry-run（非生产）：2026-10-05 15:42Z，sources 44、local pool 2255、可见并集561、外文标题候选251、可复用11、待处理240、最多选择200；provider未配置、实际调用0、写入0。未把这份 shadow 结果算作线上改善。
- 深度约束已测：缓存后的队尾记录可进入处理队列；DeepSeek only；单项最多2次、并发不超过2、最多200唯一记录/250物理请求、30秒超时；失败/空结果/迟到旧 hash 不覆盖现有成功或人工译文。真实生产翻译尚未发生。

## 4. 来源与机会质量

生产公开基线：registered 44、enabled 39、recent success 34、failed 1、needs adapter 4；审计估计 3 个来源超过 78 小时新鲜阈值、7 个从公开健康信息看从未成功。source last success 不等同于机会内容已核验。

| 生产来源矩阵分类（分类内去重；类别间不相加） | 独有记录 | current | 有贡献来源家族 |
|---|---:|---:|---:|
| 赛事/奖项 | 171 | 165 | 11 |
| 采购/订单 | 9 | 9 | 3 |
| 资助 | 3 | 3 | 1 |
| 展示 | 13 | 13 | 7 |
| 市集/渠道 | 9 | 9 | 4 |
| 驻留/研修 | 5 | 5 | 2 |
| 合作/委托 | 2 | 2 | 2 |
| 认定/孵化 | 0 | 0 | 0 |

主要实际贡献（来源行贡献数，可能跨源重复，不应相加）：第一征集网 62、设计竞赛网 59、鲸创意 52、American Craft Council 21、优本视觉 14、CaFÉ 12、CFW 12。完整 ID 与多源关联在 `source-contribution-matrix.json`。

- 许可状态：ArtConnect 官方条款（2026-08-26 更新）要求对自动化访问/采集和内容复制/再发布事先书面许可，当前没有书面授权证据；候选 source governance 标为 `COMPLIANCE_HOLD`，不自动抓取/复制并保留原 source identity。线上旧代码仍标 ACTIVE，公开审计观察到其贡献3条；该修复尚未部署。[ArtConnect 条款](https://www.magazine.artconnect.com/terms)
- 其余43个来源在本次审计中均为 `NOT_REVIEWED`；不等于已获许可。
- 来源贡献以公开 API 返回的记录和 ID 计算；同一机会可在多个标签/来源行出现，不把标签行求和冒充市场规模。
- 正常“HTTP可读但解析为0项”与无法识别格式分别记录；fixtures 覆盖空结果成功、未识别 parser、403失败和 partial listing。
- 公开可见安全检查：API暴露的 encoding error 0、不安全精确截止 0；公开样本范围之外的内部记录不可观测，不据样本宣称全池绝对无错。

## 5. 行动闭环

- 候选流程（隔离合成数据）：机会查看→证据/资格核验→按服务端注入的认证主体保存状态/备注/下次日期→再次读取仍保留→变化事件幂等→私有站内待办按用户隔离并可标已读。测试全部通过，但这是合成 fixture，不是生产用户操作。
- 候选站内入口：采购页链接到 `/ich/procurement/inbox`；重要变化页 `/ich/procurement/changes`；API `/api/opportunity-v2/workbench/inbox`。无服务端 resolver 时页面/API拒绝访问，不展示他人私有内容。
- 生产真实身份验收失败：匿名与伪造 query 返回401，但带伪造 `x-business-user` 的生产 GET 返回200。审计取消了响应 body，没有读取或保存任何私有备注；因此确认的是身份控制缺口，不声称已看到具体私有数据。
- 候选代码不再从请求头/查询/JSON body 选 owner；默认无已注入 resolver 时全拒绝。尚未将应用真实登录 session 接到 resolver，因此生产闭环不可用。
- 合成测试覆盖 deadline / application link / eligibility 变化、普通更新时间与译文变化不制造新事件、重复处理不重复提醒、canonical别名不丢失跟进、匿名导出不包含私有字段。
- 生产读到采购工作台19条，不能将其误称为本轮逐条资格审核；本地候选截图中当前/提前跟进区为空，没有为凑数量制造记录。

## 6. 本周优先清单

本轮没有合法生产 refresh，也未能取得同一候选发布后用户可见的可信实时机会列表；因此不生成伪“本周Top 10”。API/详情的只读可访问性不替代资格、成本与来源逐项核验。

## 7. 回归与截图

- 生产实际业务 smoke：`/health`、`/api/opportunity-v2/sources/overview`、`/api/opportunity-v2/radar`、`/api/opportunity-v2/opportunities`、采购/coverage、Memo JSON/Markdown、分页HTML与一条详情样例均返回200；Memo JSON/Markdown ID 集合相同，HTML ID 是 JSON 子集（491条）。
- 真正的生产身份写链路不通过；未以通用 smoke 代替。
- Production vs main 原修复选择性保留清单见 `audits/ich/v14/latest/lineage.json`。
- `/ich`、海外、采购、综合覆盖与 Memo 页面ID全量保存于 baseline，无截断；审计保存完整公共ID并集675条。
- LOEWE：候选 canonical grouping 只聚合同届强证据组，保留 alias 跟进；不同届、结果页不合并。生产本轮未写数据。
- 截图路径及视口见 `audits/ich/ui/latest/manifest.json`。包含线上只读桌面前图、候选本地桌面/390手机图、360/430手机与200%等效视口。候选图不代表生产新版本。
- 通用 `npm run verify:all` PASS；`npm run verify:v15:e2e` PASS；V1.3 display/closeout/mobile、V1.4 translation/source-governance/baseline fixtures、V2/Memo/coverage/procurement相关测试 PASS。具体命令记录见 M4 manifest 与 GitHub CI。
- 本地预览代码与数据副本，没有生产池写入；没有向生产写 QA 数据。

## 8. 剩余工作与用户动作

按影响排序：

1. **安全**：通过受保护路径将生产跟进 API 改为真实服务端身份解析；先限制当前伪造 Header 能力，再集成实际会话身份。不要在聊天粘贴 token。
2. **生产运行**：由运维确认/启用现有的受保护 runtime refresh/DeepSeek runner，并以无秘密泄漏的方式让候选版本使用同一持久化数据路径。当前 deploy workflow 不等于数据 runner。
3. ArtConnect自动化/再发布需先取得书面许可；其他来源仍需逐家族许可/合规核验。
4. 获批准的 production刷新与PR合入后，观察7日及至少2次真实自然72h调度，再报告长期稳定。

集中需要的输入/批准：确认生产登录身份提供方/可调用的服务端 session resolver，以及批准使用的受保护 runtime作业入口（或由运维启用现有入口）；不需要将密钥传给聊天。GitHub保护分支审批由仓库规则执行。

## 9. 执行诚信

- 生产写入：**无**。抓取：无。翻译：无。DNS：NO。新增来源：0。付费/邮件/自动报名：NO。
- 未完成：授权刷新、生产翻译、受保护合并/部署、真实用户私有跟进、7日/两次调度观察。
- 真实生产只读、隔离 dry-run、合成 fixture、本地截图分别保存；不混报。
- API token、私有翻译 sidecar、备注内容均未进入公开产物。
