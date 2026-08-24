# 企业福利商机雷达紧凑顶栏 Design QA

- Source visual truth: `/var/folders/yq/r2frrbzd7jj0jhhsr4mpszch0000gn/T/codex-clipboard-6c3651a6-753c-42ff-b56b-6ffa746ca7d8.png`
- Source pixels: 1515 × 329; desktop crop; density not provided.
- Implementation: `http://127.0.0.1:3100/fuli`, captured in Codex in-app Browser tab 2.
- Implementation capture: in-app Browser visual capture at 1280 × 720 CSS px, DPR 1.
- Mobile capture: in-app Browser visual capture at 390 × 844 CSS px, DPR 1.
- State: 当前机会，默认筛选，运行时数据已加载。

## Full-view comparison evidence

The source showed a 76 px brand bar followed by a separate title-and-description hero, with the arrow requesting that hero content move into the unused center-left area of the bar. The implementation uses one 84 px desktop bar containing the logo, page title, compact product promise, and primary CTA. The standalone hero is absent and the opportunity panel begins at 104 px, eliminating the large blank first-screen interval. At 390 px the bar is 68 px high, only the page title and the compact `创建雷达` CTA remain, and the page has no horizontal overflow.

## Focused region comparison evidence

The top navigation was inspected separately because it contains the requested change. Desktop measurements: top bar 84 px, opportunity panel top 104 px. Mobile measurements: brand right edge 199 px, CTA left edge 276 px, leaving 77 px separation; subtitle hidden; no overlap or horizontal overflow. No additional focused region was needed because opportunity cards and filters were intentionally unchanged.

## Required fidelity surfaces

- Fonts and typography: existing Noto Sans SC / PingFang SC stack retained; title uses 18 px desktop and 16 px mobile; subtitle uses 12 px with 1.45 line height. Hierarchy is legible without recreating the removed 38 px hero heading.
- Spacing and layout rhythm: desktop header is 84 px and content begins 20 px below it; mobile header is 68 px and content begins 14 px below it. The requested empty vertical region is removed.
- Colors and visual tokens: existing warm business palette, green CTA, cream background, and border tokens are unchanged.
- Image quality and asset fidelity: the existing ChancePing logo asset is reused at 38 px desktop and 34 px mobile; no placeholder or generated replacement is introduced.
- Copy and content: title is `企业福利商机雷达`; compact promise is `盯机会｜持续发现企业福利采购与供应商征集机会`; mobile CTA is `创建雷达`.

## Findings

No actionable P0, P1, or P2 mismatch remains for the approved change.

## Comparison history

- Initial source finding: the separate hero consumed excessive first-screen height and duplicated the product identity.
- Fix: moved the title and promise into the brand bar, removed the hero, tightened shell spacing, and added a mobile-specific CTA label.
- Post-fix evidence: desktop panel top 104 px; mobile panel top 82 px; mobile horizontal overflow false; browser console error log empty.

## Follow-up polish

- P3: the product promise can be shortened further after real-user testing if the desktop brand line feels verbose at intermediate widths.

final result: passed

---

# ICH 联系作者页面 Design QA

- Source visual truth:
  - `/var/folders/yq/r2frrbzd7jj0jhhsr4mpszch0000gn/T/codex-clipboard-22ef8b5e-1898-49d7-a221-5c9de8e09279.png`（1685 × 535）
  - `/var/folders/yq/r2frrbzd7jj0jhhsr4mpszch0000gn/T/codex-clipboard-679bffaa-7d6a-4481-8b8e-23c27af34314.png`（1068 × 522）
- Implementation screenshots:
  - `/tmp/ich-contact-desktop-final.png`（1265 × 712，CSS viewport 1280 × 720，DPR 1）
  - `/tmp/ich-contact-mobile-final.png`（375 × 812，CSS viewport 390 × 844，DPR 1）
- Route/state: `/ich/source-principles`，默认静态状态。
- Comparison: 两张用户标注截图与桌面实现已放入同一浏览器画面并排核对；联系栏另在移动端核对同一基线与页面横向溢出。

## Findings

- 字体与排版：沿用现有宋体标题、无衬线正文和 ChancePing 文化风格层级；联系信息在桌面与手机端保持同一基线。
- 间距与布局：来源原则调整为左侧标题、右侧两栏正文，消除了旧版错位与大面积空白；移动端自动堆叠为单栏。
- 色彩与视觉变量：继续使用现有纸色、墨色、青灰、陶红和细分隔线，没有引入新视觉体系。
- 图像质量：二维码仍使用用户提供的原始 1194 × 1575 JPEG，没有裁剪、拉伸或替换。
- 文案与内容：页脚入口已改为“联系作者”；姓名、邮箱和微信已进入同一联系信息栏。
- 交互与可访问性：邮箱仍为可点击 `mailto:` 链接；页面在 390px 视口没有文档级横向溢出；浏览器控制台无错误。

## Comparison history

1. 首轮移动端发现强制单行会产生页面级横向溢出（P2）。
2. 为联系内容容器增加最小宽度约束，并将必要的横向滚动限制在联系信息栏内部。
3. 复查结果：`documentScrollWidth` 小于 viewport，三项联系信息 `top` 坐标一致，P2 已关闭。

## Implementation checklist

- [x] 来源原则区重新排版
- [x] 页脚入口改为“联系作者”
- [x] 姓名、邮箱、微信同栏同基线
- [x] 桌面和移动端视觉复查
- [x] 控制台错误检查

final result: passed
