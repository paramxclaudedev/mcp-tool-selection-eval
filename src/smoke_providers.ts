import { config as dotenvConfig } from "dotenv";
dotenvConfig({ override: true });
import { loadQueries, loadTools } from "./load.ts";
import { makeGeminiRunner } from "./runners/gemini.ts";
import { makeOpenAIRunner } from "./runners/openai.ts";

async function main() {
  const { flat } = await loadTools();
  const queries = (await loadQueries()).slice(0, 3);

  const runners = [
    makeGeminiRunner("gemini-2.5-pro"),
    makeGeminiRunner("gemini-2.5-flash"),
    makeOpenAIRunner("gpt-4o"),
    makeOpenAIRunner("gpt-4o-mini"),
  ];

  for (const r of runners) {
    console.log(`\n[provider-smoke] ${r.model}`);
    for (const q of queries) {
      const res = await r.run(q, flat);
      const status = res.error
        ? `ERROR: ${res.error.slice(0, 80)}`
        : `→ ${res.first_tool ?? "NONE"}`;
      console.log(
        `  ${q.id} ${status} ${res.latency_ms}ms $${res.cost_usd.toFixed(4)}`,
      );
    }
  }
}

main().catch(console.error);
