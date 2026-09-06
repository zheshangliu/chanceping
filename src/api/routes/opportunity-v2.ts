import { Hono } from "hono";
import { createOpportunityV2Source, findOpportunityV2Source, filterOpportunityV2Radar, readOpportunityV2Pool, readOpportunityV2Sources, runOpportunityV2, runOpportunityV2Source, setOpportunityV2SourceState, testOpportunityV2Source, updateOpportunityV2Source, writeOpportunityV2Sources, type OpportunityV2Fetcher, type OpportunityV2RadarQuery, type OpportunityV2Source, type OpportunityV2SourceInput } from "../../opportunity-v2";

export interface OpportunityV2RouteOptions { sourcesPath?: string; poolPath?: string; healthPath?: string; fetcher?: OpportunityV2Fetcher; }

function queryOf(raw: Record<string, string>): OpportunityV2RadarQuery {
  const region = raw.region === "CN" || raw.region === "GLOBAL" ? raw.region : undefined;
  return { ...(raw.q ? { q: raw.q } : {}), ...(region ? { region } : {}), ...(raw.source_id ? { source_id: raw.source_id } : {}), ...(raw.tag ? { tag: raw.tag } : {}), ...(raw.include_uncertain === "true" ? { include_uncertain: true } : {}) };
}

function listValue(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  return typeof value === "string" ? value.split(",").map((item) => item.trim()).filter(Boolean) : [];
}

function sourceInput(body: Record<string, unknown>): OpportunityV2SourceInput {
  return {
    ...(typeof body.id === "string" ? { id: body.id } : {}),
    name: String(body.name ?? ""), url: String(body.url ?? ""),
    region: body.region === "GLOBAL" ? "GLOBAL" : "CN", priority: body.priority === "P1" ? "P1" : "P0",
    types: listValue(body.types), radars: listValue(body.radars),
  };
}

async function bodyOf(c: { req: { json: () => Promise<unknown> } }): Promise<Record<string, unknown>> {
  return await c.req.json().catch(() => ({})) as Record<string, unknown>;
}

export function opportunityV2Routes(options: OpportunityV2RouteOptions = {}): Hono {
  const app = new Hono();
  const sources = () => readOpportunityV2Sources(options.sourcesPath);
  const pool = () => readOpportunityV2Pool(options.poolPath);
  const sourceOr404 = (sourceId: string) => findOpportunityV2Source(sourceId, options.sourcesPath);

  app.get("/sources", (c) => c.json({ sources: sources() }));
  app.post("/sources", async (c) => {
    try {
      const source = createOpportunityV2Source(sourceInput(await bodyOf(c)));
      if (sourceOr404(source.id)) return c.json({ error: { code: "CONFLICT", message: "Source ID 已存在" } }, 409);
      writeOpportunityV2Sources([...sources(), source], options.sourcesPath);
      const test = await testOpportunityV2Source({ sourceId: source.id, fetcher: options.fetcher, sourcesPath: options.sourcesPath, healthPath: options.healthPath });
      const run = test.ok ? await runOpportunityV2Source({ sourceId: source.id, fetcher: options.fetcher, sourcesPath: options.sourcesPath, poolPath: options.poolPath, healthPath: options.healthPath }) : null;
      return c.json({ source: findOpportunityV2Source(source.id, options.sourcesPath), test, run });
    } catch (error) {
      return c.json({ error: { code: "INVALID_SOURCE", message: error instanceof Error ? error.message : String(error) } }, 400);
    }
  });
  app.put("/sources/:id", async (c) => {
    if (!sourceOr404(c.req.param("id"))) return c.json({ error: { code: "NOT_FOUND", message: "Source 不存在" } }, 404);
    try {
      const body = await bodyOf(c);
      const patch: Partial<OpportunityV2Source> = {};
      if ("name" in body) patch.name = String(body.name ?? "");
      if ("url" in body) patch.url = String(body.url ?? "");
      if (body.region === "CN" || body.region === "GLOBAL") patch.region = body.region;
      if (body.priority === "P0" || body.priority === "P1") patch.priority = body.priority;
      if ("types" in body) patch.types = listValue(body.types);
      if ("radars" in body) patch.radars = listValue(body.radars);
      if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
      const source = updateOpportunityV2Source(c.req.param("id"), patch, options.sourcesPath);
      return c.json({ source });
    } catch (error) {
      return c.json({ error: { code: "INVALID_SOURCE", message: error instanceof Error ? error.message : String(error) } }, 400);
    }
  });
  app.post("/sources/:id/enable", (c) => {
    if (!sourceOr404(c.req.param("id"))) return c.json({ error: { code: "NOT_FOUND", message: "Source 不存在" } }, 404);
    return c.json({ source: setOpportunityV2SourceState(c.req.param("id"), { enabled: true, status: "ACTIVE" }, options.sourcesPath) });
  });
  app.post("/sources/:id/pause", (c) => {
    if (!sourceOr404(c.req.param("id"))) return c.json({ error: { code: "NOT_FOUND", message: "Source 不存在" } }, 404);
    return c.json({ source: setOpportunityV2SourceState(c.req.param("id"), { enabled: false, status: "PAUSED" }, options.sourcesPath) });
  });
  app.delete("/sources/:id", (c) => {
    if (!sourceOr404(c.req.param("id"))) return c.json({ error: { code: "NOT_FOUND", message: "Source 不存在" } }, 404);
    return c.json({ source: setOpportunityV2SourceState(c.req.param("id"), { enabled: false, status: "PAUSED" }, options.sourcesPath) });
  });
  app.post("/sources/:id/test", async (c) => {
    if (!sourceOr404(c.req.param("id"))) return c.json({ error: { code: "NOT_FOUND", message: "Source 不存在" } }, 404);
    return c.json(await testOpportunityV2Source({ sourceId: c.req.param("id"), fetcher: options.fetcher, sourcesPath: options.sourcesPath, healthPath: options.healthPath }));
  });
  app.post("/sources/:id/run", async (c) => {
    if (!sourceOr404(c.req.param("id"))) return c.json({ error: { code: "NOT_FOUND", message: "Source 不存在" } }, 404);
    return c.json(await runOpportunityV2Source({ sourceId: c.req.param("id"), fetcher: options.fetcher, sourcesPath: options.sourcesPath, poolPath: options.poolPath, healthPath: options.healthPath }));
  });
  app.get("/opportunities", (c) => {
    const items = filterOpportunityV2Radar(pool().opportunities, sources(), queryOf(c.req.query()));
    return c.json({ schema_version: "chanceping-opportunity-v2.v1", total: items.length, opportunities: items });
  });
  app.get("/radar", (c) => {
    const sourcePool = sources();
    const items = filterOpportunityV2Radar(pool().opportunities, sourcePool, queryOf(c.req.query()));
    return c.json({ radar_id: "ich", name: "非遗机会雷达", source_pool: sourcePool.filter((source) => source.enabled), total: items.length, opportunities: items });
  });
  app.get("/opportunities/:id", (c) => {
    const item = pool().opportunities.find((candidate) => candidate.id === c.req.param("id"));
    if (!item) return c.json({ error: { code: "NOT_FOUND", message: "机会不存在" } }, 404);
    return c.json(item);
  });
  app.post("/run", async (c) => c.json(await runOpportunityV2({ sourcesPath: options.sourcesPath, poolPath: options.poolPath, healthPath: options.healthPath, fetcher: options.fetcher })));
  return app;
}
