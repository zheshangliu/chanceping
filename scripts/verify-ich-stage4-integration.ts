import fs from "fs";
import os from "os";
import path from "path";
import { createApp } from "../src/api/app";
import { createIchFixture } from "./fixtures/ich-opportunity";

let passed = 0;
let failed = 0;
function check(name: string, condition: boolean, detail = ""): void {
  if (condition) {
    passed += 1;
    console.log(`[PASS] ${name}`);
  } else {
    failed += 1;
    console.error(`[FAIL] ${name}${detail ? `: ${detail}` : ""}`);
  }
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), "ich-stage4c-"));
const opportunityPath = path.join(root, "opportunities.json");
const submissionPath = path.join(root, "submissions.json");
const transactionPath = path.join(root, "accept.transaction.json");
const token = "stage4-integration-token";
process.env.CHANCEPING_ICH_STORE_PATH = opportunityPath;
process.env.CHANCEPING_ICH_SUBMISSION_STORE_PATH = submissionPath;
process.env.CHANCEPING_ICH_SUBMISSION_TRANSACTION_PATH = transactionPath;
process.env.CHANCEPING_ICH_ADMIN_TOKEN = token;
process.env.CHANCEPING_ICH_SUBMISSION_HMAC_SECRET = "stage4-integration-hmac";

const auth = {
  Authorization: `Bearer ${token}`,
  "X-ICH-Actor": "browser-reviewer",
  "Content-Type": "application/json",
};

async function postSubmission(app: ReturnType<typeof createApp>, index: number): Promise<Response> {
  return app.request("/api/public/ich/submissions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": `integration-${index}`,
      "X-Forwarded-For": `198.51.100.${index}`,
    },
    body: JSON.stringify({
      source_url: `https://official.example.gov.cn/notice-${index}`,
      title_hint: `非遗机会 ${index}`,
      note: "集成验收",
      contact_email: `submitter${index}@example.com`,
      website: "",
      form_started_at: Date.now() - 5000,
    }),
  });
}

async function main(): Promise<void> {
  console.log("\n[ICH Stage 4C] Full-app security and persistence integration\n");
  const app = createApp();

  const homeResponse = await app.request("/ich");
  const home = await homeResponse.text();
  check("full app mounts ICH SSR with absolute canonical", homeResponse.status === 200 &&
    home.includes('href="https://ich.chanceping.com/ich"'));
  check("full app serves source principles", (await app.request("/ich/source-principles")).status === 200);
  const contactQr = await app.request("/assets/ich-jason-wechat-qr.jpg");
  check("full app serves the contact author QR image", contactQr.status === 200 &&
    contactQr.headers.get("content-type") === "image/jpeg" &&
    (await contactQr.arrayBuffer()).byteLength > 100_000);

  const submitPageResponse = await app.request("/ich/submit");
  const submitPage = await submitPageResponse.text();
  check("submit page renders a real protected form", submitPageResponse.status === 200 &&
    submitPage.includes('id="source-form"') && submitPage.includes("form_started_at"));
  check("submit page has no-store, CSP and frame protection",
    submitPageResponse.headers.get("cache-control") === "no-store" &&
    submitPageResponse.headers.get("content-security-policy")?.includes("frame-ancestors 'none'") === true &&
    submitPageResponse.headers.get("x-frame-options") === "DENY");

  const originalFetch = globalThis.fetch;
  let outboundFetches = 0;
  globalThis.fetch = (async () => {
    outboundFetches += 1;
    throw new Error("unexpected outbound fetch");
  }) as typeof fetch;
  const submittedResponses: Response[] = [];
  try {
    for (let index = 1; index <= 3; index += 1) submittedResponses.push(await postSubmission(app, index));
  } finally {
    globalThis.fetch = originalFetch;
  }
  check("three public submissions enter review queue", submittedResponses.every((response) => response.status === 202));
  check("submission requests perform no outbound URL fetch", outboundFetches === 0);
  check("public response does not expose email or internal id",
    !(await submittedResponses[0].clone().text()).includes("submitter") &&
    !(await submittedResponses[0].text()).includes("ichsub_"));

  check("anonymous internal queue remains protected",
    (await app.request("/api/internal/ich/submissions")).status === 401);
  check("invalid internal pagination is rejected",
    (await app.request("/api/internal/ich/submissions?page_size=101", { headers: auth })).status === 400);

  const queueResponse = await app.request("/api/internal/ich/submissions?page=1&page_size=2", { headers: auth });
  const queuePage = await queueResponse.json() as {
    items: Array<{ id: string; source_url: string }>;
    total: number;
    total_pages: number;
  };
  check("authenticated queue is paginated", queueResponse.status === 200 &&
    queuePage.items.length === 2 && queuePage.total === 3 && queuePage.total_pages === 2);

  const allQueue = await (await app.request("/api/internal/ich/submissions", { headers: auth })).json() as {
    items: Array<{ id: string; source_url: string }>;
  };
  const [acceptedSubmission, rejectedSubmission, pendingSubmission] = allQueue.items;
  const acceptedCandidate = createIchFixture({
    slug: "stage4-integration-draft",
    title: "集成验收草稿",
    sources: [{
      ...createIchFixture().sources[0],
      url: acceptedSubmission.source_url,
    }],
  });
  const acceptResponse = await app.request(`/api/internal/ich/submissions/${acceptedSubmission.id}/accept`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ opportunity: acceptedCandidate }),
  });
  check("reviewer accepts source as draft through full app", acceptResponse.status === 200);

  const rejectResponse = await app.request(`/api/internal/ich/submissions/${rejectedSubmission.id}/reject`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ reason: "不符合非遗机会范围" }),
  });
  check("reviewer rejects second source through full app", rejectResponse.status === 200);

  const states = await (await app.request("/api/internal/ich/submissions", { headers: auth })).json() as {
    items: Array<{ id: string; status: string }>;
  };
  const stateById = new Map(states.items.map((item) => [item.id, item.status]));
  check("pending, rejected and accepted states all exist",
    stateById.get(acceptedSubmission.id) === "accepted" &&
    stateById.get(rejectedSubmission.id) === "rejected" &&
    stateById.get(pendingSubmission.id) === "pending");

  const publicList = await (await app.request("/api/public/ich/opportunities")).json() as {
    items: Array<{ slug: string }>;
  };
  const sitemap = await (await app.request("/ich/sitemap.xml")).text();
  check("accepted draft is absent from public API and sitemap",
    !publicList.items.some((item) => item.slug === "stage4-integration-draft") &&
    !sitemap.includes("stage4-integration-draft"));
  check("submission page is listed but admin is absent from sitemap",
    sitemap.includes("https://ich.chanceping.com/ich/submit") && !sitemap.includes("/ich/admin"));

  const robots = await (await app.request("/ich/robots.txt")).text();
  check("robots declares public and protected boundaries",
    robots.includes("Allow: /ich") && robots.includes("Disallow: /api/internal/"));

  const reloaded = createApp();
  const reloadedQueue = await (await reloaded.request("/api/internal/ich/submissions", { headers: auth })).json() as {
    items: Array<{ id: string; status: string }>;
  };
  const reloadedStates = new Map(reloadedQueue.items.map((item) => [item.id, item.status]));
  check("all review states persist after app reconstruction",
    reloadedStates.get(acceptedSubmission.id) === "accepted" &&
    reloadedStates.get(rejectedSubmission.id) === "rejected" &&
    reloadedStates.get(pendingSubmission.id) === "pending");
  const reloadedOpportunity = await (await reloaded.request("/api/internal/ich/opportunities", { headers: auth })).json() as {
    items: Array<{ slug: string; workflow: { state: string } }>;
  };
  check("accepted opportunity remains a draft after restart",
    reloadedOpportunity.items.some((item) => item.slug === "stage4-integration-draft" &&
      item.workflow.state === "draft"));
  check("transaction journal is absent after successful workflow", !fs.existsSync(transactionPath));

  console.log(`\nICH Stage 4C integration result: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main().finally(() => {
  delete process.env.CHANCEPING_ICH_STORE_PATH;
  delete process.env.CHANCEPING_ICH_SUBMISSION_STORE_PATH;
  delete process.env.CHANCEPING_ICH_SUBMISSION_TRANSACTION_PATH;
  delete process.env.CHANCEPING_ICH_ADMIN_TOKEN;
  delete process.env.CHANCEPING_ICH_SUBMISSION_HMAC_SECRET;
  fs.rmSync(root, { recursive: true, force: true });
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
