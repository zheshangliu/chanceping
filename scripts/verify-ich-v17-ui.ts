import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ichPagesRoutes } from "../src/api/routes/ich-pages";
import type { OpportunityV2, OpportunityV2Source } from "../src/opportunity-v2/types";

const now = new Date("2026-10-20T04:00:00.000Z");
const source: OpportunityV2Source = { id: "source-ok", name: "手工艺机会来源", url: "https://craft.example/opportunities", region: "CN", priority: "P0", types: ["competition"], radars: ["ich"], enabled: true, status: "ACTIVE", last_fetch_at: now.toISOString() };
const opportunity: OpportunityV2 = {
  id: "opp-v17-ui-1", title: "2026 竹编文创设计征集", summary: "面向竹编手艺人的产品创作机会。", source_id: source.id, source_item_id: "fixture-1", source_name: source.name,
  source_url: "https://craft.example/list", detail_url: "https://craft.example/notice/1", category: "competition", region: "CN", tags: ["竹编", "文创"],
  deadline: "2026-12-20", deadline_text: "截止2026-12-20", status: "CURRENT", first_seen_at: now.toISOString(), last_seen_at: now.toISOString(), discovered_by_sources: [source.id], radar_relevance: "RELEVANT", directions: ["craft_arts"], work_formats: ["material_craft"],
};

async function run(): Promise<void> {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "ich-v17-ui-"));
  const poolPath = path.join(temp, "opportunities.json");
  const sourcesPath = path.join(temp, "sources.json");
  fs.writeFileSync(poolPath, JSON.stringify({ schema_version: "chanceping-opportunity-v2.v1", updated_at: now.toISOString(), opportunities: [opportunity] }));
  fs.writeFileSync(sourcesPath, JSON.stringify({ schema_version: "chanceping-opportunity-v2.sources.v1", sources: [source] }));
  try {
    const app = ichPagesRoutes({ opportunityV2: true, opportunityV2PoolPath: poolPath, opportunityV2SourcesPath: sourcesPath, now: () => now });
    const home = await app.request("/", {}, { hostname: "ich.chanceping.com" });
    assert.equal(home.status, 200);
    const html = await home.text();
    assert.match(html, /id="ich-agent-title"[^>]*>告诉我，您想找什么机会/u);
    assert.match(html, /id="ich-agent-input"[^>]*maxlength="2000"/u);
    assert.match(html, /ich-agent-form>label\{position:absolute/u, "无障碍 label 不得挤占桌面输入框网格列");
    assert.match(html, /ich-meta\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/u, "手机 Hero 统计应改为可换行的两列，不得裁切");
    assert.match(html, /ich-agent-form textarea\{box-sizing:border-box;min-width:0;max-width:100%;width:100%\}/u, "手机大输入框必须收敛在视口宽度内");
    assert.match(html, /ich-agent-heading>\*\{min-width:0;max-width:100%\}/u, "手机助手标题和说明不得按内容最小宽度撑开容器");
    assert.match(html, /帮我找/u);
    assert.match(html, /data-agent-example/u);
    assert.match(html, /value="auto" selected/u);
    assert.match(html, /<details id="ich-classic-search" class="ich-classic-search"\s*>/u, "普通搜索与全部筛选默认可折叠，不从旧系统删除");
    assert.match(html, /搜索比赛、征集、文创、非遗关键词/u);
    assert.match(html, /赛事方向：/u);
    assert.match(html, /作品形式：/u);
    assert.match(html, /当前赛事：1/u);
    assert.match(html, /本周值得看/u);
    assert.match(html, /\/ich\/memo/u);
    assert.match(html, /\/ich\/agent\.js/u);
    assert.match(html, /data-reading-toggle/u, "公共页面 Header 应提供键盘可达的大字切换");
    assert.match(html, /\/ich\/reading-mode\.js/u, "字体切换脚本应在所有公共页面加载");
    assert.match(html, /data-agent-clear hidden/u, "清空临时会话控件须有明确文字，且初始隐藏");
    assert.doesNotMatch(html, /选择模型|供应商 API Key|DeepSeek API Key/u);

    const filtered = await app.request("/?q=竹编", {}, { hostname: "ich.chanceping.com" });
    const filteredHtml = await filtered.text();
    assert.match(filteredHtml, /id="ich-classic-search" class="ich-classic-search" open/u, "直接进入带筛选条件的旧链接时筛选区自动展开");
    assert.match(filteredHtml, /竹编文创设计征集/u);
    const script = await app.request("/agent.js");
    assert.equal(script.status, 200);
    assert.match(script.headers.get("content-type") ?? "", /javascript/u);
    const scriptText = await script.text();
    assert.match(scriptText, /credentials: "same-origin"/u);
    assert.match(scriptText, /deadlineText/u, "助手日期展示需用中文日期，不显示 ISO 时间戳");
    assert.match(scriptText, /competition: "赛事 \/ 征集"/u, "机会类型须使用中文标签");
    assert.match(scriptText, /evidenceFieldText/u, "证据字段须使用中文标签");
    assert.match(scriptText, /result\.lifecycle === "historical" \? "已截止"/u, "网页原文明示已过报名截止时，结果卡必须标明已截止");
    assert.match(scriptText, /保存这份清单/u, "保存操作应先展开复制、下载和打印选项");
    assert.match(scriptText, /复制文字/u, "行动清单须可复制");
    assert.match(scriptText, /浏览器未允许自动复制/u, "剪贴板受限时须提供全选文本回退");
    assert.match(scriptText, /打印清单/u, "行动清单须可打印");
    assert.match(scriptText, /清空本次临时对话吗/u, "清空临时状态需一次明确确认");
    assert.match(scriptText, /method: "DELETE"/u, "清空会话须删除服务端临时会话");
    assert.match(scriptText, /查看其他结果/u, "前三条以外的匹配须有继续查看入口");
    const memo = await app.request("/memo");
    assert.match(await memo.text(), /data-reading-toggle/u, "大字切换需跨 memo 页面保留");
    const readingScript = await app.request("/reading-mode.js");
    assert.equal(readingScript.status, 200);
    assert.match(readingScript.headers.get("content-type") ?? "", /javascript/u);
    console.log("ICH_V17_UI: PASS");
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
