let pass = 0;
let fail = 0;

function check(name: string, condition: boolean, detail = ""): void {
  if (condition) {
    pass += 1;
    console.log(`PASS ${name}`);
  } else {
    fail += 1;
    console.error(`FAIL ${name}${detail ? `: ${detail}` : ""}`);
  }
}

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function requireRemoteBaseUrl(): string | null {
  const value = normalizeBaseUrl(process.env.CHANCEPING_DEPLOY_BASE_URL ?? "");
  if (value) return value;
  const required = /^(1|true|yes)$/i.test(process.env.CHANCEPING_DEPLOY_BASE_URL_REQUIRED ?? "");
  if (required) {
    check("CHANCEPING_DEPLOY_BASE_URL is configured", false, "set the deployed site URL");
    console.log(`Q7 Aliyun remote smoke: ${pass} PASS / ${fail} FAIL`);
    process.exit(1);
  }
  console.log("SKIP Q7 Aliyun remote smoke: CHANCEPING_DEPLOY_BASE_URL is not set");
  process.exit(0);
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  return await fetch(`${baseUrl}${path}`, init);
}

async function text(path: string): Promise<{ response: Response; body: string }> {
  const response = await request(path);
  return { response, body: await response.text() };
}

async function json<T>(path: string, init?: RequestInit): Promise<{ response: Response; payload: T }> {
  const response = await request(path, init);
  return { response, payload: await response.json() as T };
}

async function createChatWindow(body: Record<string, unknown>) {
  return await json<{ success: boolean; data?: any; error?: any }>("/api/radar-chats", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function listChatWindows(userId: string) {
  return await json<{ success: boolean; data?: any[]; error?: any }>(`/api/radar-chats?user_id=${encodeURIComponent(userId)}`);
}

async function deleteChatWindow(id: string) {
  return await json<{ success: boolean; data?: any; error?: any }>(`/api/radar-chats/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

async function verifyVisiblePages(): Promise<void> {
  const health = await json<{ success: boolean; data?: any; error?: any }>("/health");
  check("remote /health returns OK", health.response.status === 200 && health.payload.success === true && health.payload.data?.status === "ok", String(health.response.status));

  const visiblePaths = [
    "/",
    "/home.js",
    "/hero-radar-chat.js",
    "/radars.js",
    "/radar-detail.js",
    "/radar-profile.js",
    "/watch-result.js",
    "/search.js",
    "/aievents",
  ];
  const pages: Array<{ path: string; body: string }> = [];
  for (const path of visiblePaths) {
    const page = await text(path);
    check(`remote ${path} is served`, page.response.status === 200, String(page.response.status));
    pages.push({ path, body: page.body });
  }

  const joined = pages.map((page) => page.body).join("\n");
  check("remote visible pages do not mention DeepSeek", !/DeepSeek/i.test(joined));
  [
    "盯机会正在理解并生成雷达",
    "盯机会正在画雷达",
    "盯机会正在搜索机会并整理证据",
    "盯机会正在生成机会报告",
    "全球 AI 赛事导航",
  ].forEach((phrase) => {
    check(`remote visible pages include ${phrase}`, joined.includes(phrase));
  });
  check("remote AI Events page avoids sample-room wording", !/样板间/.test(pages.find((page) => page.path === "/aievents")?.body ?? ""));
}

async function verifyPublicAiEvents(): Promise<void> {
  const feed = await json<{ success: boolean; data?: any; error?: any }>("/api/public/ai-events?status=current&page=1&page_size=8");
  check("remote public AI events feed returns 200", feed.response.status === 200 && feed.payload.success === true, JSON.stringify(feed.payload.error ?? {}));
  check("remote public AI events feed has cards", Array.isArray(feed.payload.data?.items) && feed.payload.data.items.length > 0, JSON.stringify(feed.payload.data?.stats ?? {}));
  check("remote current event feed has pagination metadata", Number(feed.payload.data?.stats?.page) === 1 && Number(feed.payload.data?.stats?.pageSize) === 8 && Number(feed.payload.data?.stats?.totalPages) >= 1, JSON.stringify(feed.payload.data?.stats ?? {}));
  check("remote current event feed exposes lifecycle counts", Number(feed.payload.data?.stats?.currentCount) > 0 && Number(feed.payload.data?.stats?.historicalCount) >= 0, JSON.stringify(feed.payload.data?.stats ?? {}));
  check("remote public feed includes rich event metadata", (feed.payload.data?.items ?? []).some((item: any) => item.coverImageUrl && item.deadline && item.reward && item.organizer && item.region), JSON.stringify(feed.payload.data?.items?.slice(0, 2) ?? {}));
  check("remote public feed includes TAIKAI source", (feed.payload.data?.sourceNetwork ?? []).some((source: any) => source.id === "taikai"), JSON.stringify(feed.payload.data?.sourceNetwork ?? {}));
  const operations = feed.payload.data?.operations;
  check("remote public feed exposes safe update cadence", operations?.updateCadenceDays === 3 && typeof operations?.lastCollectedAt === "string" && typeof operations?.nextScheduledCollectionAt === "string", JSON.stringify(operations ?? {}));
  check("remote public feed exposes safe source health summary", typeof operations?.sourceHealth?.available === "boolean" && typeof operations?.sourceHealth?.healthyCount === "number" && typeof operations?.sourceHealth?.failedCount === "number", JSON.stringify(operations?.sourceHealth ?? {}));

  const historical = await json<{ success: boolean; data?: any; error?: any }>("/api/public/ai-events?status=historical&page=1&page_size=8");
  check("remote historical event feed returns 200", historical.response.status === 200 && historical.payload.success === true, JSON.stringify(historical.payload.error ?? {}));
  check("remote historical event feed exposes historical cards when available", Number(historical.payload.data?.stats?.historicalCount) === 0 || (historical.payload.data?.items ?? []).length > 0, JSON.stringify(historical.payload.data?.stats ?? {}));

  const filtered = await json<{ success: boolean; data?: any; error?: any }>("/api/public/ai-events?status=current&category=ai_hackathon&region=global_online&page=1&page_size=8");
  check("remote public feed accepts category and region filters", filtered.response.status === 200 && filtered.payload.success === true && Number(filtered.payload.data?.stats?.page) === 1, JSON.stringify(filtered.payload.error ?? {}));
  const serialized = JSON.stringify(feed.payload);
  check("remote public feed does not expose keys", !/API_KEY|SERPER_API_KEY|CONTEST_LLM_API_KEY|COMMERCIAL_LLM_API_KEY|sk-[A-Za-z0-9]/i.test(serialized));
  check("remote public feed hides internal radar/run ids", !/radar_id|run_id|runId|profileRevisionId|openedUrls/i.test(serialized));
}

async function verifyUserRadarWindows(): Promise<void> {
  const userId = `aliyun_remote_${Date.now()}`;
  const sample = await createChatWindow({
    radarId: "ai-event-sample-room",
    userId,
    title: "全球 AI 赛事导航",
    draftRadarVersion: "V1.0",
    pendingMessage: "我想查看全球 AI 赛事导航。",
  });
  check("remote user can open built-in AI events navigator", sample.response.status === 200 && sample.payload.success === true, JSON.stringify(sample.payload.error ?? {}));
  check("remote built-in navigator keeps public title", sample.payload.data?.title === "全球 AI 赛事导航", sample.payload.data?.title ?? "");

  const customIds: string[] = [];
  for (let index = 1; index <= 3; index += 1) {
    const created = await createChatWindow({
      userId,
      title: `远程 smoke 自定义雷达 ${index}`,
      draftRadarVersion: "V1.0",
      pendingMessage: `远程 smoke 第 ${index} 个自定义雷达。`,
    });
    check(`remote user can create custom radar ${index}`, created.response.status === 200 && created.payload.success === true, JSON.stringify(created.payload.error ?? {}));
    if (created.payload.data?.id) customIds.push(created.payload.data.id);
  }

  const fourth = await createChatWindow({
    userId,
    title: "远程 smoke 第四个自定义雷达",
    draftRadarVersion: "V1.0",
  });
  check("remote fourth custom radar is blocked", fourth.response.status === 403 && fourth.payload.error?.code === "RADAR_CHAT_QUOTA_EXCEEDED", JSON.stringify(fourth.payload));

  const listed = await listChatWindows(userId);
  const windows = listed.payload.data ?? [];
  check("remote user list has one built-in navigator", windows.filter((item) => item.radarId === "ai-event-sample-room").length === 1, JSON.stringify(windows.map((item) => item.title)));
  check("remote user list has three custom windows", windows.filter((item) => item.radarId !== "ai-event-sample-room").length === 3, JSON.stringify(windows.map((item) => item.title)));

  if (customIds[0]) {
    const deleted = await deleteChatWindow(customIds[0]);
    check("remote custom window delete succeeds", deleted.response.status === 200 && deleted.payload.data?.deleted === true, JSON.stringify(deleted.payload.error ?? {}));
  }
}

const baseUrl = requireRemoteBaseUrl();

async function run(): Promise<void> {
  await verifyVisiblePages();
  await verifyPublicAiEvents();
  await verifyUserRadarWindows();

  console.log(`Q7 Aliyun remote smoke: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
