import { DeepSeekAdapter } from "../src/agents/deepseek-adapter";

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail = ""): void {
  if (condition) {
    passed += 1;
    console.log(`PASS ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL ${name}${detail ? ` -> ${detail}` : ""}`);
  }
}

async function main(): Promise<void> {
  const originalFetch = globalThis.fetch;
  const secret = "retry-test-secret";
  try {
    let serverErrorAttempts = 0;
    globalThis.fetch = async () => {
      serverErrorAttempts += 1;
      if (serverErrorAttempts === 1) {
        return new Response("temporary upstream failure", { status: 500 });
      }
      return Response.json({ choices: [{ message: { content: "recovered" } }] });
    };
    let recoveredContent = "";
    let serverError = "";
    try {
      const recovered = await new DeepSeekAdapter({
        apiKey: secret,
        baseUrl: "https://llm.invalid/v1",
        model: "retry-test",
        mockMode: false,
      }).chat({ messages: [{ role: "user", content: "retry" }] });
      recoveredContent = recovered.content;
    } catch (error) {
      serverError = error instanceof Error ? error.message : String(error);
    }
    check("DeepSeek retries one HTTP 500 and recovers", serverErrorAttempts === 2 && recoveredContent === "recovered", `attempts=${serverErrorAttempts}, error=${serverError}`);

    let badRequestAttempts = 0;
    globalThis.fetch = async () => {
      badRequestAttempts += 1;
      return new Response("bad request", { status: 400 });
    };
    let badRequestError = "";
    try {
      await new DeepSeekAdapter({
        apiKey: secret,
        baseUrl: "https://llm.invalid/v1",
        model: "retry-test",
        mockMode: false,
      }).chat({ messages: [{ role: "user", content: "do not retry" }] });
    } catch (error) {
      badRequestError = error instanceof Error ? error.message : String(error);
    }
    check("DeepSeek does not retry HTTP 400", badRequestAttempts === 1, `attempts=${badRequestAttempts}`);
    check("DeepSeek retry errors never expose API key", !badRequestError.includes(secret), badRequestError);
  } finally {
    globalThis.fetch = originalFetch;
  }

  console.log(`LLM retry: ${passed} PASS / ${failed} FAIL`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
