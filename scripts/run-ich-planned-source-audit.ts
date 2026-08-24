import fs from "node:fs";
import path from "node:path";
import { getIchSourceRegistryV2 } from "../src/ich/source-registry-v2";

const registry = getIchSourceRegistryV2();
const endpointAudit = JSON.parse(fs.readFileSync(path.resolve("docs/ich/DS1-A-来源端点核验记录_V1.0.json"), "utf8")) as { results: Array<{ id: string; status: number | null; page_type: string; javascript_required: boolean; error: string | null }> };
const endpointById = new Map(endpointAudit.results.map((item) => [item.id, item]));
const items = registry.sources.filter((source) => source.operational_status === "planned").map((source) => {
  const endpoint = endpointById.get(source.id);
  const http = endpoint?.status ?? null;
  const recommended_mode = endpoint?.status === 200 && endpoint.page_type !== "error" && endpoint.page_type !== "blocked" && !endpoint.javascript_required ? "adapter_candidate" : endpoint?.status === 403 || endpoint?.page_type === "blocked" ? "manual_or_allowed_fetch" : "manual_review";
  return { source_id: source.id, name: source.name, canonical_url: source.canonical_url, categories: source.categories, geography: source.geography, evidence_level: source.evidence_level, scan_frequency: source.scan_frequency, http_status: http, page_type: endpoint?.page_type ?? "not_checked", javascript_required: endpoint?.javascript_required ?? null, recommended_mode, endpoint_error: endpoint?.error ?? null };
});
const groups = Object.fromEntries([...new Set(items.map((item) => item.recommended_mode))].map((mode) => [mode, items.filter((item) => item.recommended_mode === mode).length]));
const audit = { schema_version: "ich-planned-source-audit.v1", stage: "SRC-R0", audited_at: new Date().toISOString(), formal_store_write: false, planned_total: items.length, recommendation_counts: groups, follow_up_count: items.filter((item) => item.recommended_mode !== "adapter_candidate").length, items };
fs.writeFileSync(path.resolve("docs/ich/SRC-planned来源盘点_V1.0.json"), `${JSON.stringify(audit, null, 2)}\n`);
fs.writeFileSync(path.resolve("docs/ich/SRC-planned来源盘点报告_V1.0.md"), `# SRC-R0 planned 来源盘点报告 V1.0\n\n- planned 来源：${items.length}\n- 推荐分组：${Object.entries(groups).map(([key, value]) => `${key}=${value}`).join("，")}\n- 需人工跟进：${audit.follow_up_count}\n- 正式库写入：**false**\n\n本轮只根据来源端点核验结果提出采集模式建议，没有修改来源注册状态。只有完成采集合同、只读试跑和质量门禁后，才可将来源状态升级。\n\n机器记录：[SRC-planned来源盘点_V1.0.json](./SRC-planned来源盘点_V1.0.json)。\n`);
console.log(JSON.stringify({ stage: "SRC-R0", gate: "pass_with_followups", planned_total: items.length, recommendation_counts: groups, follow_up_count: audit.follow_up_count, formal_store_write: false }, null, 2));
