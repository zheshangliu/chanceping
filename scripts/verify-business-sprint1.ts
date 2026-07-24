import { createApp } from "../src/api/app";

let failures = 0;
function check(name: string, condition: boolean): void {
  console.log(`${condition ? "PASS" : "FAIL"} ${name}`);
  if (!condition) failures += 1;
}

async function main(): Promise<void> {
  const app = createApp();
  const editions = ["guangzhou", "tianhe", "shaoguan"];
  for (const edition of editions) {
    const page = await app.request(`/${edition}`);
    check(`${edition} homepage serves Business shell`, page.status === 200 && (await page.text()).includes("business-app"));
    const list = await app.request(`/${edition}/opportunities`);
    check(`${edition} opportunities route serves Business shell`, list.status === 200 && (await list.text()).includes("business.js"));
    for (const page of ["sources", "about", "opportunities/example-opportunity", "not-a-page"]) {
      const result = await app.request(`/${edition}/${page}`);
      check(`${edition} ${page} route serves Business shell`, result.status === 200 && (await result.text()).includes("business-app"));
    }
  }
  const root = await app.request("/", { headers: { Host: "business.chanceping.com" } });
  check("Business host root redirects to Guangzhou", root.status === 302 && root.headers.get("location") === "/guangzhou");
  const mainRoot = await app.request("/");
  check("main host root remains main site", mainRoot.status === 200 && (await mainRoot.text()).includes("panel-home"));
  const api = await app.request("/api/business/editions/guangzhou");
  const apiBody = await api.json() as { success?: boolean; data?: { edition?: { id?: string } } };
  check("edition config API returns Guangzhou config", api.status === 200 && apiBody.success === true && apiBody.data?.edition?.id === "guangzhou");
  const missing = await app.request("/api/business/editions/unknown");
  check("unknown edition returns 404", missing.status === 404);
  if (failures > 0) process.exitCode = 1;
}

main();
