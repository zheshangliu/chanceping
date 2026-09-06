import { Hono } from "hono";
import { filterOpportunityV2Radar, readOpportunityV2Pool, readOpportunityV2Sources, runOpportunityV2, type OpportunityV2RadarQuery } from "../../opportunity-v2";

export interface OpportunityV2RouteOptions { sourcesPath?: string; poolPath?: string; }

function queryOf(raw: Record<string, string>): OpportunityV2RadarQuery {
  const region = raw.region === "CN" || raw.region === "GLOBAL" ? raw.region : undefined;
  return { ...(raw.q ? { q: raw.q } : {}), ...(region ? { region } : {}), ...(raw.source_id ? { source_id: raw.source_id } : {}), ...(raw.tag ? { tag: raw.tag } : {}), ...(raw.include_uncertain === "true" ? { include_uncertain: true } : {}) };
}

export function opportunityV2Routes(options: OpportunityV2RouteOptions = {}): Hono {
  const app = new Hono();
  const sources = () => readOpportunityV2Sources(options.sourcesPath);
  const pool = () => readOpportunityV2Pool(options.poolPath);
  app.get("/sources", (c) => c.json({ sources: sources() }));
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
  app.post("/run", async (c) => c.json(await runOpportunityV2({ sourcesPath: options.sourcesPath, poolPath: options.poolPath })));
  return app;
}
