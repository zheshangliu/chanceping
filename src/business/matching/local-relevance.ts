import type { BusinessEditionId } from "../edition-config";
import type { BusinessOpportunity } from "../opportunity";
import type { LocalRelevanceResult } from "./types";

export function evaluateLocalRelevance(item: BusinessOpportunity, edition: BusinessEditionId): LocalRelevanceResult {
  if (item.editions.includes(edition)) {
    const label = edition === "guangzhou" ? "广州" : edition === "tianhe" ? "天河" : "韶关";
    if (item.regions.some((region) => region.includes(label) || region.toLowerCase().includes(edition))) return { status: "DIRECT", reason: `明确适用于${label}地区` };
    if (item.regions.some((region) => /广东|全省|全国/.test(region))) return { status: "PROVINCE", reason: `适用于广东或更大范围，${label}企业可进一步确认` };
    return { status: "DIRECT", reason: `已进入${label}版本，需核对公告适用范围` };
  }
  return { status: "WEAK", reason: "机会未声明适用于当前地区版本" };
}
