import { getIchSourceRegistryV2 } from "./source-registry-v2";
import type { IchPrimaryCategory } from "./types";

export const ICH_DS7_SOURCE_WORKFLOW_SCHEMA = "ich-ds7-source-workflow.v1" as const;
export type IchDs7WorkflowMode = "adapter" | "manual";

export interface IchDs7SourceWorkflow {
  workflow_id: string;
  source_id: string;
  mode: IchDs7WorkflowMode;
  discovery_url: string;
  categories: IchPrimaryCategory[];
  geography: string[];
  scan_frequency: "daily" | "every_3_days" | "weekly";
  status: "ready";
  candidate_contract: string[];
  collection_steps: string[];
}

const registry = getIchSourceRegistryV2();
const source = (sourceId: string) => {
  const item = registry.sources.find((candidate) => candidate.id === sourceId);
  if (!item) throw new Error(`DS7 source is not registered: ${sourceId}`);
  return item;
};
const contract = ["具体详情页 URL", "标题", "主办方", "截止或长期有效证据", "地区", "参与资格", "行动方式", "字段 provenance", "原始快照哈希"];
const manualSteps = ["打开来源入口", "定位当前公告/机会详情页", "保存原始 URL 与页面快照", "逐字段填写候选表", "回到第一方页面复核后提交 DS3"];
const make = (workflowId: string, sourceId: string, mode: IchDs7WorkflowMode): IchDs7SourceWorkflow => {
  const item = source(sourceId);
  return { workflow_id: workflowId, source_id: item.id, mode, discovery_url: item.canonical_url, categories: [...item.categories], geography: [...item.geography], scan_frequency: item.scan_frequency, status: "ready", candidate_contract: contract, collection_steps: mode === "manual" ? manualSteps : ["运行来源适配器", "保存原始快照和哈希", "输出候选及字段 provenance", "提交 DS3 质量分层"] };
};

export const ICH_DS7_SOURCE_WORKFLOWS: IchDs7SourceWorkflow[] = [
  make("adapter-ccgp-procurement", "ccgp", "adapter"),
  make("adapter-gd-culture-notices", "gd-culture", "adapter"),
  make("adapter-yuexiu-notices", "yuexiu-notices", "adapter"),
  make("adapter-mct-notices", "mct-notices", "adapter"),
  make("adapter-cnaf-guides", "cnaf", "adapter"),
  make("adapter-ichina-notices", "ichina", "adapter"),
  make("adapter-gmfyg-events", "gmfyg", "adapter"),
  make("manual-gd-procurement", "gd-procurement", "manual"),
  make("manual-ggzy", "ggzy", "manual"),
  make("manual-gz-public-resources", "gz-ggzy", "manual"),
  make("manual-gz-culture", "gz-culture", "manual"),
  make("manual-gd-museum", "gdmuseum", "manual"),
  make("manual-cnicif", "cnicif", "manual"),
  make("manual-crafts-council", "crafts-council-uk", "manual"),
  make("manual-unesco-ich", "unesco-ich", "manual"),
];
