import { config as dotenvConfig } from "dotenv";
dotenvConfig({ override: true });
import Anthropic from "@anthropic-ai/sdk";
import { loadQueries, loadTools } from "./load.ts";
import { makeAnthropicRunner } from "./runners/anthropic.ts";
import { judgeRow } from "./judge.ts";
import { summarize } from "./score.ts";
import { writeReport } from "./report.ts";
import type { Query, Runner, ScoredRow } from "./types.ts";
import { readFileSync, existsSync } from "node:fs";

function loadEnvFromTriage(): void {
  const path = `${process.env.HOME}/.config/inbox-triage.env`;
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^(?:export\s+)?([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!m) continue;
    const [, k, v] = m;
    if (!k || (process.env[k] && process.env[k] !== "")) continue;
    process.env[k] = v!.replace(/^"|"$/g, "");
  }
}

const smoke = process.argv.includes("--smoke");

async function main() {
  loadEnvFromTriage();
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY missing (checked env + ~/.config/inbox-triage.env)",
    );
  }

  const { flat } = await loadTools();
  let queries: Query[] = await loadQueries();
  if (smoke) queries = queries.slice(0, 5);

  const runners: Runner[] = [
    makeAnthropicRunner("claude-opus-4-7"),
    makeAnthropicRunner("claude-sonnet-4-6"),
    makeAnthropicRunner("claude-haiku-4-5-20251001"),
  ];

  console.log(
    `[run] ${queries.length} queries × ${runners.length} models = ${queries.length * runners.length} rows`,
  );
  console.log(`[run] tool catalog: ${flat.length} tools`);

  const judgeClient = new Anthropic();
  const scored: ScoredRow[] = [];

  for (const r of runners) {
    console.log(`\n[model] ${r.model}`);
    for (let i = 0; i < queries.length; i++) {
      const q = queries[i]!;
      const res = await r.run(q, flat);
      const judged = await judgeRow(judgeClient, q, res, flat);
      const row: ScoredRow = {
        ...res,
        ...judged,
        model: r.model,
      } as ScoredRow;
      (row as unknown as { category: string }).category = q.category;
      scored.push(row);
      const status = judged.tool_correct
        ? "ok"
        : judged.tool_in_any_of
          ? "any-of"
          : "MISS";
      console.log(
        `  ${String(i + 1).padStart(2)}/${queries.length} ${q.id} [${q.category}] → ${res.first_tool ?? "NONE"} ${status} param=${judged.param_score}/5 ${res.latency_ms}ms $${res.cost_usd.toFixed(4)}`,
      );
    }
  }

  const summaries = summarize(scored);
  const runId =
    new Date().toISOString().replace(/[:.]/g, "-") + (smoke ? "-smoke" : "");
  const { mdPath, csvPath, jsonlPath } = await writeReport(
    runId,
    scored,
    summaries,
  );

  console.log("\n=== SUMMARY ===");
  for (const s of summaries) {
    console.log(
      `${s.model.padEnd(30)} correct=${s.tool_correct_pct.toFixed(1)}%  any-of=${s.tool_in_any_of_pct.toFixed(1)}%  param=${s.avg_param_score.toFixed(2)}/5  lat=${s.avg_latency_ms.toFixed(0)}ms  cost=$${s.total_cost_usd.toFixed(4)}  cache=${(s.cache_hit_rate * 100).toFixed(1)}%`,
    );
  }
  console.log(`\nReport → ${mdPath}`);
  console.log(`CSV    → ${csvPath}`);
  console.log(`Rows   → ${jsonlPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
