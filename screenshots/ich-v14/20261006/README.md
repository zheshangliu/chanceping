# V1.4 真实页面预览截图

生成时间：2026-10-06（Asia/Shanghai）。

`production-before-ich-desktop.png` 是只读访问线上 `https://ich.chanceping.com/ich` 的桌面截图。其余 `candidate-*` 截图来自本地候选代码预览 `http://127.0.0.1:3188`；本地运行时数据与线上不同，不能视为生产部署后的截图。

首页截图包含 1440×1200 桌面、360×844、390×844、430×844 移动视口，以及 195 CSS px / DPR 2 的 200% 等效布局截图。最后一种是视口/DPR 模拟，不是浏览器缩放菜单截图。采购工作台另有 1440×1200 与 390×844 截图。

视口、DOM 可视边界与 scrollWidth 检查详见 `audits/ich/ui/latest/checks.json`。在 390px 预览中，发现并修复了采购筛选控件被横向裁切的问题；筛选项现在分两行，所有控件都落在视口内。
