import fs from "fs";
import os from "os";
import path from "path";
import { Hono } from "hono";
import { ichPagesRoutes } from "../src/api/routes/ich-pages";
import { defaultIchSubmissionStore, ichSubmissionRoutes } from "../src/api/routes/ich-submissions";
import { internalIchSubmissionRoutes } from "../src/api/routes/internal-ich-submissions";
import { publicIchRoutes } from "../src/api/routes/public-ich";
import { IchPublicationService } from "../src/ich/publication-service";
import {
  defaultIchSubmissionRuntimeDir,
  defaultIchSubmissionStorePath,
  defaultIchSubmissionTransactionPath,
  isChancePingProductionRuntime,
} from "../src/ich/submission-runtime";
import { IchSubmissionAcceptanceService } from "../src/ich/submission-service";
import { IchSubmissionStore } from "../src/ich/submission-store";
import { IchOpportunityStore } from "../src/ich/store";
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

const root = fs.mkdtempSync(path.join(os.tmpdir(), "ich-stage4b-"));
const submissionPath = path.join(root, "submissions.json");
const opportunityPath = path.join(root, "opportunities.json");
const transactionPath = path.join(root, "accept.transaction.json");
const accessLogPath = path.join(root, "access.log");
const submissionStore = new IchSubmissionStore(submissionPath);
const opportunityStore = new IchOpportunityStore(opportunityPath);
const fixedDate = new Date("2026-07-24T06:00:00.000Z");
const now = () => fixedDate;
const token = "stage4-test-token";
fs.writeFileSync(accessLogPath, [
  '203.0.113.10 - - [24/Jul/2026:13:58:00 +0800] "GET /ich HTTP/1.1" 200 1200 "-" "Mozilla/5.0 Chrome/126"',
  '203.0.113.10 - - [24/Jul/2026:13:59:00 +0800] "GET /ich/opportunities/example HTTP/1.1" 200 900 "https://ich.chanceping.com/ich" "Mozilla/5.0 Chrome/126"',
  '203.0.113.20 - - [23/Jul/2026:10:00:00 +0800] "GET /ich HTTP/1.1" 200 1200 "-" "Mozilla/5.0 iPhone Mobile"',
  '203.0.113.30 - - [24/Jul/2026:10:00:00 +0800] "GET /ich HTTP/1.1" 200 1200 "-" "Googlebot"',
  '203.0.113.40 - - [24/Jul/2026:10:00:00 +0800] "GET /ich/admin HTTP/1.1" 200 1200 "-" "Mozilla/5.0 Chrome/126"',
  '203.0.113.50 - - [24/Jul/2026:10:00:00 +0800] "GET /ich/missing HTTP/1.1" 404 1200 "-" "Mozilla/5.0 Chrome/126"',
].join("\n"));
const publicApp = new Hono().route("/api/public/ich", ichSubmissionRoutes({
  store: submissionStore,
  hmacSecret: "stage4-hmac-secret",
  now,
}));
const internalApp = new Hono().route("/api/internal/ich", internalIchSubmissionRoutes({
  store: opportunityStore,
  submissionStore,
  transactionPath,
  adminToken: token,
  now,
  accessLogPath,
}));
const auth = {
  Authorization: `Bearer ${token}`,
  "X-ICH-Actor": "stage4-reviewer",
  "Content-Type": "application/json",
};

function submissionBody(url: string, overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    source_url: url,
    title_hint: "官方非遗征集",
    note: "请核验",
    contact_email: "source@example.com",
    website: "",
    form_started_at: fixedDate.getTime() - 5000,
    ...overrides,
  });
}

async function submit(url: string, userAgent = "stage4-test"): Promise<Response> {
  return publicApp.request("/api/public/ich/submissions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": userAgent,
      "X-Forwarded-For": "203.0.113.20",
    },
    body: submissionBody(url),
  });
}

async function main(): Promise<void> {
  console.log("\n[ICH Stage 4B] Safe source submission and review queue\n");

  const originalNodeEnv = process.env.NODE_ENV;
  const originalRuntimeDir = process.env.CHANCEPING_ICH_RUNTIME_DIR;
  const originalStorePath = process.env.CHANCEPING_ICH_SUBMISSION_STORE_PATH;
  const originalTransactionPath = process.env.CHANCEPING_ICH_SUBMISSION_TRANSACTION_PATH;
  delete process.env.CHANCEPING_ICH_RUNTIME_DIR;
  delete process.env.CHANCEPING_ICH_SUBMISSION_STORE_PATH;
  delete process.env.CHANCEPING_ICH_SUBMISSION_TRANSACTION_PATH;
  process.env.NODE_ENV = "production";
  check("production submissions default to persistent runtime storage",
    defaultIchSubmissionRuntimeDir() === "/var/lib/chanceping/ich" &&
    defaultIchSubmissionStorePath() === "/var/lib/chanceping/ich/ich-source-submissions.json" &&
    defaultIchSubmissionTransactionPath() === "/var/lib/chanceping/ich/ich-submission-accept.transaction.json");
  check("ChancePing release directories use persistent runtime storage without NODE_ENV",
    isChancePingProductionRuntime("/opt/chanceping/current", "") &&
    isChancePingProductionRuntime("/opt/chanceping/releases/20260824", "") &&
    !isChancePingProductionRuntime(root, ""));
  process.env.CHANCEPING_ICH_RUNTIME_DIR = root;
  check("submission runtime directory remains configurable",
    defaultIchSubmissionStorePath() === path.join(root, "ich-source-submissions.json") &&
    defaultIchSubmissionTransactionPath() === path.join(root, "ich-submission-accept.transaction.json"));
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = originalNodeEnv;
  if (originalRuntimeDir === undefined) delete process.env.CHANCEPING_ICH_RUNTIME_DIR; else process.env.CHANCEPING_ICH_RUNTIME_DIR = originalRuntimeDir;
  if (originalStorePath === undefined) delete process.env.CHANCEPING_ICH_SUBMISSION_STORE_PATH; else process.env.CHANCEPING_ICH_SUBMISSION_STORE_PATH = originalStorePath;
  if (originalTransactionPath === undefined) delete process.env.CHANCEPING_ICH_SUBMISSION_TRANSACTION_PATH; else process.env.CHANCEPING_ICH_SUBMISSION_TRANSACTION_PATH = originalTransactionPath;

  const disabled = new Hono().route("/api/public/ich", ichSubmissionRoutes({
    store: new IchSubmissionStore(path.join(root, "disabled.json")),
    hmacSecret: "",
    now,
  }));
  check("submission API is disabled without a fingerprint secret",
    (await disabled.request("/api/public/ich/submissions", { method: "POST", body: "{}" })).status === 503);

  const accepted = await submit("https://official.example.gov.cn/notice/?b=2&a=1#section");
  check("valid HTTPS source is accepted asynchronously", accepted.status === 202 &&
    (await accepted.json() as { accepted: boolean }).accepted === true);
  check("submission is normalized and stored separately", submissionStore.list().length === 1 &&
    submissionStore.list()[0].source_url === "https://official.example.gov.cn/notice?a=1&b=2" &&
    opportunityStore.list().length === 0);
  check("submission write creates no opportunity file", !fs.existsSync(opportunityPath));

  const migrationCwd = path.join(root, "migration-release");
  const migrationLegacyPath = path.join(migrationCwd, "data", "ich-source-submissions.json");
  const migrationRuntime = path.join(root, "migration-runtime");
  new IchSubmissionStore(migrationLegacyPath).replaceAll(submissionStore.list());
  const cwdBeforeMigration = process.cwd();
  const runtimeBeforeMigration = process.env.CHANCEPING_ICH_RUNTIME_DIR;
  process.chdir(migrationCwd);
  process.env.CHANCEPING_ICH_RUNTIME_DIR = migrationRuntime;
  const migratedStore = defaultIchSubmissionStore();
  process.chdir(cwdBeforeMigration);
  if (runtimeBeforeMigration === undefined) delete process.env.CHANCEPING_ICH_RUNTIME_DIR;
  else process.env.CHANCEPING_ICH_RUNTIME_DIR = runtimeBeforeMigration;
  check("legacy release queue migrates to persistent runtime once",
    migratedStore.list().length === 1 &&
    fs.existsSync(path.join(migrationRuntime, "ich-source-submissions.json")));

  const duplicate = await submit("https://OFFICIAL.example.gov.cn/notice?a=1&b=2");
  check("duplicate URL receives the same non-enumerating response", duplicate.status === 202 &&
    submissionStore.list().length === 1);

  const honeypot = await publicApp.request("/api/public/ich/submissions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: submissionBody("https://spam.example/notice", { website: "bot-filled" }),
  });
  check("honeypot silently accepts without persisting", honeypot.status === 202 && submissionStore.list().length === 1);

  check("HTTP URL is rejected", (await submit("http://example.gov.cn/notice", "http-test")).status === 400);
  check("credential-bearing URL is rejected", (await submit("https://user:pass@example.gov.cn/notice", "credential-test")).status === 400);
  check("non-standard port is rejected", (await submit("https://example.gov.cn:8443/notice", "port-test")).status === 400);
  check("too-fast form submission is rejected", (await publicApp.request("/api/public/ich/submissions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "fast-test" },
    body: submissionBody("https://example.gov.cn/fast", { form_started_at: fixedDate.getTime() }),
  })).status === 400);
  check("oversized submission is rejected with 413", (await publicApp.request("/api/public/ich/submissions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "large-test" },
    body: JSON.stringify({ note: "x".repeat(17 * 1024) }),
  })).status === 413);

  await submit("https://rate.example.gov.cn/one", "rate-test");
  await submit("https://rate.example.gov.cn/two", "rate-test");
  await submit("https://rate.example.gov.cn/three", "rate-test");
  const rateLimited = await submit("https://rate.example.gov.cn/four", "rate-test");
  check("persisted fingerprint rate limit rejects fourth request", rateLimited.status === 429 &&
    rateLimited.headers.get("retry-after") === "600");

  check("anonymous reviewer cannot read submissions",
    (await internalApp.request("/api/internal/ich/submissions")).status === 401);
  const listResponse = await internalApp.request("/api/internal/ich/submissions", { headers: auth });
  const list = await listResponse.json() as { items: Array<{ id: string; source_url: string }> };
  check("authenticated reviewer can read queue", listResponse.status === 200 && list.items.length === 4);

  check("anonymous reviewer cannot read access analytics",
    (await internalApp.request("/api/internal/ich/analytics")).status === 401);
  const analyticsResponse = await internalApp.request("/api/internal/ich/analytics", { headers: auth });
  const analyticsText = await analyticsResponse.text();
  const analytics = JSON.parse(analyticsText) as {
    source_available: boolean;
    today: { page_views: number; visitors: number };
    last_7_days: { page_views: number; visitors: number };
    top_pages: Array<{ path: string; views: number }>;
  };
  check("analytics aggregates human ICH page views without exposing visitor identifiers",
    analyticsResponse.status === 200 && analytics.source_available &&
    analytics.today.page_views === 2 && analytics.today.visitors === 1 &&
    analytics.last_7_days.page_views === 3 && analytics.last_7_days.visitors === 2 &&
    analytics.top_pages[0]?.path === "/ich" && analytics.top_pages[0]?.views === 2 &&
    !analyticsText.includes("203.0.113") && !analyticsText.includes("Chrome/126"));

  const rejectedId = list.items.find((item) => item.source_url.includes("/one"))?.id ?? "";
  const rejectedResponse = await internalApp.request(`/api/internal/ich/submissions/${rejectedId}/reject`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ reason: "不是非遗机会" }),
  });
  check("reviewer can reject with an audited reason", rejectedResponse.status === 200 &&
    submissionStore.get(rejectedId)?.status === "rejected" &&
    submissionStore.get(rejectedId)?.review_reason === "不是非遗机会");

  const acceptedSubmission = submissionStore.list().find((item) => item.source_url.includes("official.example"))!;
  const wrongSourceCandidate = createIchFixture({ slug: "wrong-source" });
  check("accept requires preserving submitted source URL", (await internalApp.request(
    `/api/internal/ich/submissions/${acceptedSubmission.id}/accept`,
    { method: "POST", headers: auth, body: JSON.stringify({ opportunity: wrongSourceCandidate }) },
  )).status === 400 && submissionStore.get(acceptedSubmission.id)?.status === "pending");

  const candidate = createIchFixture({
    slug: "accepted-source-draft",
    title: "来源提交转草稿",
    sources: [{
      ...createIchFixture().sources[0],
      url: acceptedSubmission.source_url,
    }],
  });
  const acceptResponse = await internalApp.request(`/api/internal/ich/submissions/${acceptedSubmission.id}/accept`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ opportunity: candidate }),
  });
  const acceptedResult = await acceptResponse.json() as {
    submission: { status: string; opportunity_id: string };
    opportunity: { id: string; workflow: { state: string }; is_published: boolean };
  };
  check("accept transaction creates a server-owned draft", acceptResponse.status === 200 &&
    acceptedResult.submission.status === "accepted" &&
    acceptedResult.opportunity.workflow.state === "draft" &&
    acceptedResult.opportunity.is_published === false);
  check("submission and opportunity are linked", acceptedResult.submission.opportunity_id === acceptedResult.opportunity.id &&
    submissionStore.get(acceptedSubmission.id)?.opportunity_id === acceptedResult.opportunity.id);
  check("completed acceptance removes transaction journal", !fs.existsSync(transactionPath));

  const publicRead = new Hono().route("/api/public/ich", publicIchRoutes({ store: opportunityStore, now }));
  const publicList = await (await publicRead.request("/api/public/ich/opportunities")).json() as { total: number };
  const pages = new Hono().route("/ich", ichPagesRoutes({ store: opportunityStore, now }));
  const sitemap = await (await pages.request("/ich/sitemap.xml")).text();
  check("accepted draft stays out of public API and sitemap", publicList.total === 0 &&
    !sitemap.includes("accepted-source-draft"));

  const reloadedSubmissions = new IchSubmissionStore(submissionPath);
  const reloadedOpportunities = new IchOpportunityStore(opportunityPath);
  check("submission and draft persist across restart", reloadedSubmissions.get(acceptedSubmission.id)?.status === "accepted" &&
    reloadedOpportunities.getBySlug("accepted-source-draft")?.workflow.state === "draft");

  const recoverySubmissionResponse = await submit("https://recovery.example.gov.cn/notice", "recovery-test");
  check("recovery fixture submission is accepted", recoverySubmissionResponse.status === 202);
  const recoverySubmission = submissionStore.list().find((item) => item.source_url.includes("recovery.example"))!;
  const recoveryCandidate = createIchFixture({
    slug: "recovery-draft",
    sources: [{ ...createIchFixture().sources[0], url: recoverySubmission.source_url }],
  });
  const recoveryOpportunity = new IchPublicationService(opportunityStore).create(recoveryCandidate, {
    actor: "transaction-recovery",
    now: fixedDate,
  });
  fs.writeFileSync(transactionPath, `${JSON.stringify({
    schema_version: "1.0",
    submission_id: recoverySubmission.id,
    opportunity_slug: recoveryOpportunity.slug,
    started_at: fixedDate.toISOString(),
  })}\n`);
  new IchSubmissionAcceptanceService(submissionStore, opportunityStore, transactionPath);
  check("transaction journal recovers interrupted acceptance", submissionStore.get(recoverySubmission.id)?.status === "accepted" &&
    submissionStore.get(recoverySubmission.id)?.opportunity_id === recoveryOpportunity.id &&
    !fs.existsSync(transactionPath));

  const adminPage = await (await new Hono().route("/ich/admin",
    (await import("../src/api/routes/ich-admin-pages")).ichAdminPagesRoutes()).request("/ich/admin")).text();
  check("admin UI exposes analytics and complete submission review controls",
    adminPage.includes("非遗机会运营台") && adminPage.includes("今日浏览") &&
    adminPage.includes("近 7 天访问趋势") && adminPage.includes("游客提交来源") &&
    adminPage.includes("标记重复") && adminPage.includes("垃圾信息") &&
    adminPage.includes('api("/analytics")') && adminPage.includes("/submissions/"));

  const submitPage = await (await new Hono().route("/ich", ichPagesRoutes({ store: opportunityStore, now }))
    .request("/ich/submit")).text();
  check("submit UI prevents duplicate clicks and surfaces safe API messages",
    submitPage.includes("button.disabled=true") && submitPage.includes("body.error?.message") &&
    submitPage.includes("来源已进入人工审核队列"));

  console.log(`\nICH Stage 4B result: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main().finally(() => fs.rmSync(root, { recursive: true, force: true })).catch((error) => {
  console.error(error);
  process.exit(1);
});
