import {
  AI_EVENT_SAMPLE_ROOM_CANDIDATES,
  AI_EVENT_SOURCE_NETWORK,
  getPublicAiEventSampleRoomData,
} from "../src/demo/ai-events-sample-room";

let passCount = 0;
let failCount = 0;

function check(name: string, condition: boolean, detail = ""): void {
  if (condition) {
    passCount++;
    console.log(`[PASS] ${name}`);
  } else {
    failCount++;
    console.error(`[FAIL] ${name}${detail ? `: ${detail}` : ""}`);
  }
}

function stringify(value: unknown): string {
  return JSON.stringify(value ?? {});
}

console.log("\n[Q7 AI Events Source Network] Sample room contract\n");

const publicData = getPublicAiEventSampleRoomData();
const serialized = stringify(publicData);
const allCards = publicData.items ?? [];
const displayCards = allCards.filter((item) => item.displayable !== false);
const officialUrls = allCards.map((item) => item.officialUrl).filter(Boolean);
const sourceNames = AI_EVENT_SOURCE_NETWORK.map((source) => `${source.name} ${source.domain} ${source.url}`);
const sourceText = sourceNames.join(" | ");
const candidateSourceText = AI_EVENT_SAMPLE_ROOM_CANDIDATES.map((candidate) => `${candidate.title} ${candidate.sourceName} ${candidate.officialUrl}`).join(" | ");

check("source network has at least 8 sources", AI_EVENT_SOURCE_NETWORK.length >= 8, `count=${AI_EVENT_SOURCE_NETWORK.length}`);
check("candidate pool has at least 30 candidates", AI_EVENT_SAMPLE_ROOM_CANDIDATES.length >= 30, `count=${AI_EVENT_SAMPLE_ROOM_CANDIDATES.length}`);
check("public API data exposes at least 15 displayable cards", displayCards.length >= 15, `count=${displayCards.length}`);
check("source network includes Devpost", /Devpost|devpost\.com/i.test(sourceText));
check("source network includes DoraHacks", /DoraHacks|dorahacks\.io/i.test(sourceText));
check("source network includes Lablab", /Lablab|lablab\.ai/i.test(sourceText));
check("source network includes Kaggle", /Kaggle|kaggle\.com/i.test(sourceText));
check("source network includes AIcrowd", /AIcrowd|aicrowd\.com/i.test(sourceText));
check("source network includes second-batch international platforms", /DrivenData|drivendata\.org/i.test(sourceText) && /Zindi|zindi\.africa/i.test(sourceText) && /Codabench|codabench|codalab/i.test(sourceText), sourceText);
check("source network includes second-batch challenge hosts", /EvalAI|eval\.ai/i.test(sourceText) && /Grand Challenge|grand-challenge\.org/i.test(sourceText), sourceText);
check("source network includes second-batch domestic platforms", /AI Studio|aistudio\.baidu\.com/i.test(sourceText) && /讯飞|xfyun|科大讯飞/i.test(sourceText) && /华为云|huaweicloud/i.test(sourceText), sourceText);
check("source network includes aggregation and benchmark sources", /CompeteHub|competehub\.dev/i.test(sourceText) && /ML Contests|mlcontests/i.test(sourceText) && /Papers with Code|paperswithcode/i.test(sourceText), sourceText);
check("source network includes second-batch creator contest sources", /Reply AI Film Festival|reply\.com/i.test(sourceText) && /Project Odyssey|projectodyssey/i.test(sourceText) && /FilmFreeway|filmfreeway\.com/i.test(sourceText), sourceText);
check("source network includes second-batch domestic and GitHub leads", /和鲸|heywhale|kesci/i.test(sourceText) && /GitHub AI contest lists|awesome-ai/i.test(sourceText) && /Arenix|arenix\.cc/i.test(sourceText), sourceText);
check("source network includes Qwen Cloud", /Qwen|qwencloud|qwen/i.test(sourceText + candidateSourceText));
check("source network includes TRAE", /TRAE|trae/i.test(sourceText + candidateSourceText));
check("source network includes cloud provider or developer program sources", /Google Cloud|Microsoft|AWS|阿里云|天池|developer/i.test(sourceText));
check("source network includes AWS as an explicit cloud-provider watch source", /aws-builder-center.*aws\.amazon\.com|AWS Builder Center.*aws\.amazon\.com/i.test(sourceText), sourceText);
check("source network includes Azure AI as an explicit cloud-provider watch source", /azure-ai-foundry.*azure\.microsoft\.com|Azure AI Foundry.*azure\.microsoft\.com/i.test(sourceText), sourceText);
check("source network includes PaddlePaddle as an explicit domestic developer source", /paddlepaddle.*paddlepaddle\.org\.cn|飞桨.*paddlepaddle\.org\.cn/i.test(sourceText), sourceText);
check("public cards include official or reviewable source URLs", officialUrls.length >= 15, `officialUrls=${officialUrls.length}`);
check("public data exposes source network metadata", Array.isArray(publicData.sourceNetwork) && publicData.sourceNetwork.length >= 8);
check("public data exposes source statistics", typeof publicData.stats?.candidateCount === "number" && publicData.stats.candidateCount >= 30);
check("public data exposes image extraction slots", /coverImageUrl|imageSourceUrl|imageAlt|imageStatus/i.test(serialized), serialized.slice(0, 240));
check("public source stats include second-batch coverage fields", /officialSourceCount|aggregatorSourceCount|imageCoverageCount/i.test(serialized), serialized.slice(0, 240));
check("public data marks search discovery separately from verified facts", allCards.some((item) => /待复核|搜索发现|需复核|needs_review|search_discovered/i.test(`${item.statusLabel} ${item.evidenceStatus} ${item.reason}`)));
check("public data keeps last checked timestamp", allCards.every((item) => typeof item.lastCheckedAt === "string" && item.lastCheckedAt.length >= 10));
check("public data has no api keys", !/API_KEY|SERPER_API_KEY|COMMERCIAL_LLM_API_KEY|CONTEST_LLM_API_KEY|sk-[A-Za-z0-9]/i.test(serialized));
check("public data hides radar and run internals", !/radarId|radar_id|run_id|runId|profileRevisionId|openedUrls/i.test(serialized));
check("public data does not present mock as success", !/mock success|demo source|innovation\.example\.com|ai-competition\.example\.com/i.test(serialized));

console.log(`\nQ7 AI events source network checks: ${passCount} PASS / ${failCount} FAIL`);

if (failCount > 0) {
  process.exit(1);
}
