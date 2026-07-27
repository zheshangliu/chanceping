import fs from "node:fs";
import path from "node:path";
import type { IchOpportunityFile } from "../src/ich/types";

const filePath = path.resolve(process.argv[2] ?? "data/ich-opportunities.json");
const file = JSON.parse(fs.readFileSync(filePath, "utf8")) as IchOpportunityFile;
const overseasRules: Array<[RegExp, string, string]> = [
  [/Mexico|墨西哥/i, "墨西哥", "MX"],
  [/Japan|日本|Itami|Kyoto|手工芸/i, "日本", "JP"],
  [/Philippines|菲律宾/i, "菲律宾", "PH"],
  [/Malta|马耳他/i, "马耳他", "MT"],
  [/Auckland|Kāpiti|Waitaki|New Zealand|新西兰/i, "新西兰", "NZ"],
  [/Nordic|L-AIR|Europe|欧洲|Horizon/i, "欧洲", "EU"],
  [/Austin|SAM |Miami|Tennessee|Tribal|American Latino|美国/i, "美国", "US"],
  [/Crafts Council|Greenwich|British Council|Historic England|Heritage Crafts|Royal Museums|Workroom|Collect|Present Makers|D'Oyly|National Lottery|Craft NI|County Hall|Potter in Residence/i, "英国", "GB"],
];
const domesticProvinceRules: Array<[RegExp, string]> = [
  [/广东|佛山|石湾|广州/, "广东省"], [/安徽/, "安徽省"], [/江西/, "江西省"], [/山东|济南/, "山东省"], [/北京/, "北京市"], [/云南/, "云南省"], [/苏州/, "江苏省"], [/西藏|类乌齐/, "西藏自治区"], [/宁夏/, "宁夏回族自治区"], [/浙江|崇明/, "浙江省"],
];
let overseasCount = 0;
for (const entry of file.entries) {
  const haystack = `${entry.title} ${entry.title_original ?? ""} ${entry.organizer.name} ${entry.sources[0]?.url ?? ""}`;
  const overseas = overseasRules.find(([pattern]) => pattern.test(haystack));
  if (overseas) {
    const [, country, code] = overseas;
    entry.location = { ...entry.location, country_code: code, country_name: country, province_state: null, city: null, district: null, region_groups: ["overseas", "online_or_unrestricted"], location_status: "confirmed" };
    overseasCount += 1;
    continue;
  }
  const province = domesticProvinceRules.find(([pattern]) => pattern.test(haystack))?.[1] ?? null;
  entry.location = { ...entry.location, country_code: "CN", country_name: "中国", province_state: province, city: province === "广东省" && /广州|广东/.test(haystack) ? "广州" : null, district: null, region_groups: [...new Set(entry.location.region_groups.filter((group) => group !== "overseas"))], location_status: province ? "confirmed" : "unknown" };
}
file.updated_at = new Date().toISOString();
fs.writeFileSync(filePath, `${JSON.stringify(file, null, 2)}\n`);
console.log(JSON.stringify({ file: filePath, entries: file.entries.length, overseas_normalized: overseasCount }, null, 2));
