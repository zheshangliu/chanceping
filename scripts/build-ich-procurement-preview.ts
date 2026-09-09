import fs from "node:fs/promises";
import path from "node:path";
import { readOpportunityV2Pool } from "../src/opportunity-v2";

async function main(): Promise<void> {
  const output = path.resolve(process.env.CHANCEPING_PROCUREMENT_PREVIEW_PATH ?? "reports/ich/procurement/preview.html");
  const probe = JSON.parse(await fs.readFile(path.resolve(process.env.CHANCEPING_PROCUREMENT_PROBE_PATH ?? "reports/ich/procurement/source-probe.json"), "utf8"));
  const pool = readOpportunityV2Pool();
  const items = pool.opportunities.filter((item) => item.procurement).slice(0, 24);
  const esc = (value: unknown) => String(value ?? "").replace(/[&<>"']/gu, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch] ?? ch));
  const rows = items.map((item) => `<tr><td>${esc(item.title)}</td><td>${esc(item.source_name)}</td><td>${esc(item.procurement?.direction)}</td><td>${esc(item.procurement?.stage)}</td><td>${esc(item.deadline ?? "未知")}</td><td><a href="${esc(item.detail_url)}">原文</a></td></tr>`).join("");
  const sourceRows = probe.sources.map((source: { source_id: string; name: string; disposition: string; http_status: number | null; reason: string }) => `<tr><td>${esc(source.source_id)}</td><td>${esc(source.name)}</td><td>${esc(source.disposition)}</td><td>${esc(source.http_status ?? "—")}</td><td>${esc(source.reason)}</td></tr>`).join("");
  const html = `<!doctype html><meta charset="utf-8"><title>盯非遗采购订单｜隔离预览</title><style>body{font:14px system-ui, sans-serif;max-width:1400px;margin:32px auto;padding:0 20px;background:#f7f2e8;color:#28251f}h1{font-family:Georgia,serif}section{background:#fffdf8;border:1px solid #d8cfbf;padding:18px;margin:20px 0;overflow:auto}table{width:100%;border-collapse:collapse}th,td{text-align:left;border-top:1px solid #e5ddcf;padding:8px;vertical-align:top}th{background:#eee6d8}a{color:#3f526b}</style><h1>盯非遗 · 采购／订单隔离预览</h1><p>仅用于开发审计，未部署生产。研究登记 ${esc(probe.source_count)} 项；不把登记数当成已接通数。</p><section><h2>已解析的采购记录样本</h2><table><thead><tr><th>项目</th><th>来源</th><th>方向</th><th>阶段</th><th>截止</th><th>原文</th></tr></thead><tbody>${rows || "<tr><td colspan=6>暂无</td></tr>"}</tbody></table></section><section><h2>177 项来源逐项处置</h2><table><thead><tr><th>ID</th><th>来源</th><th>处置</th><th>HTTP</th><th>真实原因</th></tr></thead><tbody>${sourceRows}</tbody></table></section>`;
  await fs.mkdir(path.dirname(output), { recursive: true }); await fs.writeFile(output, html + "\n"); console.log(JSON.stringify({ output, procurement_sample_rows: items.length, source_rows: probe.source_count }, null, 2));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
