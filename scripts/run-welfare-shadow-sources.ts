import { collectWelfareShadowSources } from "../src/public/welfare-opportunities";

collectWelfareShadowSources()
  .then((summary) => console.log(JSON.stringify(summary, null, 2)))
  .catch((error) => {
    console.error("[Welfare Shadow Sources]", error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
