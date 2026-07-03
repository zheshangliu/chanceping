import { createApp } from "../src/api/app";
import { createAppContext } from "../src/api/context";

let pass = 0;
let fail = 0;

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    pass += 1;
    console.log(`PASS ${name}`);
  } else {
    fail += 1;
    console.error(`FAIL ${name}${detail ? `: ${detail}` : ""}`);
  }
}

async function post(app: ReturnType<typeof createApp>, path: string, body: unknown) {
  const response = await app.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await response.json() as { success: boolean; data?: any; error?: any };
  check(`${path} returns 200`, response.status === 200, String(response.status));
  check(`${path} succeeds`, json.success === true, JSON.stringify(json.error ?? {}));
  return json.data;
}

const app = createApp(createAppContext());

async function run() {
  const initial = await post(app, "/api/radars/generate", {
    description: "我是个人开发者，想找 AI 比赛机会，帮我盯一下。",
  });
  check("initial version is V1.0", initial.radarVersion?.version === "V1.0", initial.radarVersion?.version ?? "");

  const v11 = await post(app, "/api/radars/revise", {
    previousSpec: initial.spec,
    previousRadarVersion: initial.radarVersion || initial.spec.radar_version,
    userMessage: "我不是学生，我是 OPC 创业者，优先奖金、云资源、能上架展示的比赛。",
    trigger: "requirement_correction",
  });
  check("first revision upgrades version", v11.radarVersion.version !== "V1.0", v11.radarVersion.version);
  check("first revision has visible diff", v11.radarDiff.summary.length > 0);
  check("first revision captures entrepreneur/developer intent", /创业者|开发者|OPC/i.test(JSON.stringify(v11.radarVersion)));
  check("first revision stays unconfirmed", v11.spec.confirmation_status?.user_confirmed === false, JSON.stringify(v11.spec.confirmation_status));

  const v12 = await post(app, "/api/radars/revise", {
    previousSpec: v11.spec,
    previousRadarVersion: v11.radarVersion,
    userMessage: "不要展会资讯，我要能报名的比赛。",
    trigger: "strategy_adjustment",
  });
  check("second revision upgrades version again", v12.radarVersion.version !== v11.radarVersion.version, v12.radarVersion.version);
  check("second revision downweights expo/news", /展会|资讯|新闻/.test(JSON.stringify(v12.radarDiff.downweighted)));
  check("second revision upweights registration", /报名|申请|入口|registration|application/i.test(JSON.stringify(v12.radarVersion)));
  check("second revision still waits for confirmation", v12.spec.confirmation_status?.user_confirmed === false, JSON.stringify(v12.spec.confirmation_status));

  const search = await post(app, "/api/search", {
    spec: {
      ...v12.spec,
      confirmation_status: {
        ...(v12.spec.confirmation_status || {}),
        status: "confirmed",
        user_confirmed: true,
        confirmed_at: new Date().toISOString(),
      },
    },
    query: "developer challenge hackathon cloud credits competition application",
    max_results: 2,
  });
  check("confirmed revised radar can search", Array.isArray(search.opportunityCards), "missing cards array");
  check("confirmed revised radar returns opportunity cards", (search.opportunityCards || []).length > 0, `cards=${(search.opportunityCards || []).length}`);
  check("search result keeps radar version strategy", search.searchPlan?.opportunityStrategy?.radarVersion === v12.radarVersion.version, search.searchPlan?.opportunityStrategy?.radarVersion ?? "");
}

run()
  .then(() => {
    if (fail > 0) {
      console.error(`Q.7 AI competition demo: ${pass} PASS / ${fail} FAIL`);
      process.exit(1);
    }
    console.log(`Q.7 AI competition demo: ${pass} PASS / 0 FAIL`);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
