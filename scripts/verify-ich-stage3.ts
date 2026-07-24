import fs from "fs";
import os from "os";
import path from "path";
import { Hono } from "hono";
import { ichAdminPagesRoutes } from "../src/api/routes/ich-admin-pages";
import { ichPagesRoutes } from "../src/api/routes/ich-pages";
import { internalIchRoutes } from "../src/api/routes/internal-ich";
import { publicIchRoutes } from "../src/api/routes/public-ich";
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

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "chanceping-ich-stage3-"));
const storePath = path.join(tempDirectory, "ich-opportunities.json");
const store = new IchOpportunityStore(storePath);
const token = "stage3-test-token";
const fixedNow = () => new Date("2026-07-24T12:00:00+08:00");
const internal = new Hono().route("/api/internal/ich", internalIchRoutes({ store, adminToken: token, now: fixedNow }));
const publicApi = new Hono().route("/api/public/ich", publicIchRoutes({ store, now: fixedNow }));
const pages = new Hono().route("/ich", ichPagesRoutes({ store, now: fixedNow }));
const admin = new Hono().route("/ich/admin", ichAdminPagesRoutes());
const auth = { Authorization: `Bearer ${token}`, "X-ICH-Actor": "stage3-reviewer", "Content-Type": "application/json" };

async function json(response: Response): Promise<Record<string, any>> {
  return response.json() as Promise<Record<string, any>>;
}

async function action(id: string, name: string, revision: number, reason: string | null = null): Promise<Response> {
  return internal.request(`/api/internal/ich/opportunities/${id}/${name}`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ expected_revision: revision, reason }),
  });
}

async function main(): Promise<void> {
  console.log("\n[ICH Stage 3] Authenticated publication workflow\n");

  check("internal API rejects missing bearer token", (await internal.request("/api/internal/ich/opportunities")).status === 401);
  const disabled = new Hono().route("/api/internal/ich", internalIchRoutes({ store, adminToken: "", now: fixedNow }));
  check("internal API is disabled when token is absent", (await disabled.request("/api/internal/ich/opportunities")).status === 503);

  const candidate = createIchFixture({
    title: "<script>alert(1)</script> 广州非遗市集招募",
    metadata: { ...createIchFixture().metadata, created_by: "client-forged", source_import_batch: "client-forged" },
  });
  const createResponse = await internal.request("/api/internal/ich/opportunities", {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ opportunity: candidate }),
  });
  const created = await json(createResponse);
  check("candidate creation returns 201", createResponse.status === 201);
  check("server creates draft and blocks publication", created.workflow.state === "draft" && created.is_published === false);
  check("server owns id and operator metadata", String(created.id).startsWith("ich_") && created.metadata.created_by === "stage3-reviewer" && created.metadata.source_import_batch === null);
  check("creation audit is persisted", created.workflow.history[0]?.action === "created" && created.workflow.history[0]?.actor === "stage3-reviewer");
  check("store file exists after create", fs.existsSync(storePath));
  check("reloaded store retains draft", new IchOpportunityStore(storePath).getById(created.id)?.workflow.state === "draft");

  const publicBefore = await json(await publicApi.request("/api/public/ich/opportunities"));
  check("draft is absent from public API", publicBefore.total === 0);
  check("draft detail is 404", (await publicApi.request(`/api/public/ich/opportunities/${created.slug}`)).status === 404);
  check("draft is absent from SSR", !(await (await pages.request("/ich")).text()).includes("alert(1)"));

  const staleResponse = await action(created.id, "submit-review", 99);
  check("stale revision is rejected", staleResponse.status === 409);
  const submitted = await json(await action(created.id, "submit-review", created.workflow.revision));
  check("draft submits for review", submitted.workflow.state === "pending_review" && submitted.workflow.revision === 2);
  check("direct publish before approval is rejected", (await action(created.id, "publish", submitted.workflow.revision)).status === 409);
  const approved = await json(await action(created.id, "approve", submitted.workflow.revision));
  check("reviewer approves candidate", approved.workflow.state === "approved" && approved.classification_status === "confirmed");
  const published = await json(await action(created.id, "publish", approved.workflow.revision));
  check("approved candidate publishes", published.workflow.state === "published" && published.is_published === true);
  check("publish timestamp and audit are written", published.metadata.published_at && published.workflow.history.at(-1)?.action === "published");

  const publicAfter = await json(await publicApi.request("/api/public/ich/opportunities"));
  check("published opportunity enters public API", publicAfter.total === 1 && publicAfter.items[0]?.slug === created.slug);
  const publicSerialized = JSON.stringify(publicAfter);
  check("public API hides workflow and operator data", !publicSerialized.includes("workflow") && !publicSerialized.includes("stage3-reviewer"));
  check("public API hides internal source notes", !publicSerialized.includes("内部来源备注"));
  const home = await (await pages.request("/ich")).text();
  check("SSR shows published title but escapes XSS", home.includes("&lt;script&gt;alert(1)&lt;/script&gt;") && !home.includes("<script>alert(1)</script>"));
  check("SSR detail becomes available", (await pages.request(`/ich/opportunities/${created.slug}`)).status === 200);

  const withdrawn = await json(await action(created.id, "withdraw", published.workflow.revision, "主办方要求暂时撤回"));
  check("published opportunity can be withdrawn", withdrawn.workflow.state === "withdrawn" && withdrawn.is_published === false);
  check("withdrawn opportunity immediately leaves public API", (await json(await publicApi.request("/api/public/ich/opportunities"))).total === 0);
  check("withdrawal persists across store restart", new IchOpportunityStore(storePath).getById(created.id)?.workflow.state === "withdrawn");

  const resubmitted = await json(await action(created.id, "submit-review", withdrawn.workflow.revision));
  const rejected = await json(await action(created.id, "reject", resubmitted.workflow.revision, "官方来源信息不足"));
  check("review rejection requires and records reason", rejected.workflow.state === "rejected" && rejected.workflow.review_reason === "官方来源信息不足");
  const restored = await json(await action(created.id, "restore", rejected.workflow.revision));
  check("rejected item restores to editable draft", restored.workflow.state === "draft");
  const archived = await json(await action(created.id, "archive", restored.workflow.revision));
  check("draft can be archived", archived.workflow.state === "archived" && archived.metadata.archived_at);
  check("atomic store creates recoverable backup", fs.existsSync(`${storePath}.bak`));

  const badSource = createIchFixture({ slug: "bad-source", sources: [{ ...createIchFixture().sources[0], url: "javascript:alert(1)" }] });
  const badSourceResponse = await internal.request("/api/internal/ich/opportunities", {
    method: "POST", headers: auth, body: JSON.stringify({ opportunity: badSource }),
  });
  check("unsafe source URL is rejected", badSourceResponse.status === 400);

  const oversizedResponse = await internal.request("/api/internal/ich/opportunities", {
    method: "POST", headers: auth, body: JSON.stringify({ opportunity: { description: "x".repeat(300_000) } }),
  });
  check("oversized write request is rejected", oversizedResponse.status === 400);

  const adminResponse = await admin.request("/ich/admin");
  const adminHtml = await adminResponse.text();
  check("admin page is noindex and no-store", adminResponse.headers.get("cache-control") === "no-store" && adminHtml.includes('name="robots" content="noindex,nofollow"'));
  check("admin page never embeds admin token", !adminHtml.includes(token) && adminHtml.includes("Authorization"));
  check("admin page exposes review controls", adminHtml.includes("提交审核") && adminHtml.includes("发布") && adminHtml.includes("撤回"));

  const verifiedSeedPath = path.resolve(process.cwd(), "src/ich/opportunities.verified.json");
  const seedBackedStorePath = path.join(tempDirectory, "seed-backed-store.json");
  const seedBackedStore = new IchOpportunityStore(seedBackedStorePath, verifiedSeedPath);
  const verified = seedBackedStore.load();
  check("verified production seed passes store validation", verified.entries.length >= 35 && verified.invalidEntries.length === 0);
  check("verified seed is a published audited opportunity", verified.entries[0]?.workflow.state === "published" && verified.entries[0]?.workflow.history.length === 4);
  check("verified seed uses official government source", verified.entries[0]?.sources[0]?.url.includes("yuexiu.gov.cn") && verified.entries[0]?.sources[0]?.level === "L1");
  check("verified seed has confirmed future deadline", verified.entries[0]?.dates.deadline_at === "2026-10-15");
  check("reading seed does not create primary data file", !fs.existsSync(seedBackedStorePath));

  console.log(`\nICH Stage 3 result: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exitCode = 1;
}

main().finally(() => {
  fs.rmSync(tempDirectory, { recursive: true, force: true });
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
