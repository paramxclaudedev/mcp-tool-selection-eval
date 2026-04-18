import type { CaseResult } from "./runner.js";

export type Scoreboard = {
  total: number;
  correct: number;
  accuracy: number;
  sensible: number;
  sensible_accuracy: number;
  errors: number;
};

export function isSensible(r: CaseResult): boolean {
  if (r.correct) return true;
  if (!r.picked_tool) return false;
  const pickedServer = r.picked_tool.split("_")[0] ?? "";
  for (const expected of r.correct_tools) {
    const expectedServer = expected.split("_")[0] ?? "";
    if (pickedServer !== expectedServer) continue;
    const action = expected.slice(pickedServer.length + 1);
    const isWriteAction =
      action.startsWith("create") ||
      action.startsWith("update") ||
      action.startsWith("post") ||
      action.startsWith("complete");
    const isFetchAction =
      action.startsWith("fetch") || action.startsWith("get");
    const pickedAction = r.picked_tool.slice(pickedServer.length + 1);
    const isLocator =
      pickedAction.startsWith("search") || pickedAction.startsWith("list");
    if ((isWriteAction || isFetchAction) && isLocator) return true;
  }
  return false;
}

export function scoreboard(results: CaseResult[]): Scoreboard {
  const total = results.length;
  const correct = results.filter((r) => r.correct).length;
  const sensible = results.filter(isSensible).length;
  const errors = results.filter((r) => r.error).length;
  return {
    total,
    correct,
    accuracy: total === 0 ? 0 : correct / total,
    sensible,
    sensible_accuracy: total === 0 ? 0 : sensible / total,
    errors,
  };
}

export function groupBy<K extends string>(
  results: CaseResult[],
  key: (r: CaseResult) => K,
): Record<K, CaseResult[]> {
  const out = {} as Record<K, CaseResult[]>;
  for (const r of results) {
    const k = key(r);
    (out[k] ||= []).push(r);
  }
  return out;
}

type ByModelTier = Record<string, Record<string, Scoreboard>>;

export function modelTierMatrix(results: CaseResult[]): ByModelTier {
  const out: ByModelTier = {};
  const byModel = groupBy(results, (r) => r.model);
  for (const [model, rs] of Object.entries(byModel)) {
    const byTier = groupBy(rs, (r) => r.tier);
    out[model] = {};
    for (const [tier, rs2] of Object.entries(byTier)) {
      out[model]![tier] = scoreboard(rs2);
    }
  }
  return out;
}

type ByModelCategory = Record<string, Record<string, Scoreboard>>;

export function modelCategoryMatrix(results: CaseResult[]): ByModelCategory {
  const out: ByModelCategory = {};
  const byModel = groupBy(results, (r) => r.model);
  for (const [model, rs] of Object.entries(byModel)) {
    const byCat = groupBy(rs, (r) => r.category);
    out[model] = {};
    for (const [cat, rs2] of Object.entries(byCat)) {
      out[model]![cat] = scoreboard(rs2);
    }
  }
  return out;
}

export type Confusion = Record<string, Record<string, number>>;

export function confusion(results: CaseResult[]): Confusion {
  const out: Confusion = {};
  for (const r of results) {
    if (r.correct) continue;
    const expected = r.correct_tools.join("|");
    const picked = r.picked_tool ?? "<none>";
    out[expected] ||= {};
    out[expected][picked] = (out[expected][picked] ?? 0) + 1;
  }
  return out;
}

export function costUsd(results: CaseResult[]): number {
  const price: Record<string, { in: number; cached: number; out: number }> = {
    "claude-opus-4-7": { in: 15, cached: 1.5, out: 75 },
    "claude-sonnet-4-6": { in: 3, cached: 0.3, out: 15 },
    "claude-haiku-4-5-20251001": { in: 1, cached: 0.1, out: 5 },
    "gpt-5": { in: 2.5, cached: 0.25, out: 10 },
    "gpt-5-mini": { in: 0.25, cached: 0.025, out: 2 },
    "gemini-2.5-pro": { in: 1.25, cached: 0.3125, out: 10 },
    "gemini-2.5-flash": { in: 0.3, cached: 0.075, out: 2.5 },
  };
  let usd = 0;
  for (const r of results) {
    const p = price[r.model];
    if (!p) continue;
    usd +=
      (r.input_tokens * p.in) / 1_000_000 +
      (r.cache_read_tokens * p.cached) / 1_000_000 +
      (r.cache_write_tokens * p.in * 1.25) / 1_000_000 +
      (r.output_tokens * p.out) / 1_000_000;
  }
  return usd;
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export function printReport(results: CaseResult[]): void {
  const overall = scoreboard(results);
  const mt = modelTierMatrix(results);
  const mc = modelCategoryMatrix(results);
  const conf = confusion(results);
  const usd = costUsd(results);

  console.log("");
  console.log("=".repeat(80));
  console.log("MCP TOOL SELECTION EVAL");
  console.log("=".repeat(80));
  console.log(
    `overall: ${overall.correct}/${overall.total} strict (${pct(
      overall.accuracy,
    )})   ${overall.sensible}/${overall.total} sensible (${pct(
      overall.sensible_accuracy,
    )})   errors=${overall.errors}   cost=$${usd.toFixed(4)}`,
  );
  console.log(
    `  (sensible = strict OR same-server search/list preceding a write/fetch)`,
  );

  console.log("\nmodel × tier — strict / sensible accuracy");
  const tiers = ["small", "medium", "large"];
  const models = Object.keys(mt).sort();
  console.log(
    `  ${"model".padEnd(30)} ${tiers.map((t) => t.padStart(16)).join("")}`,
  );
  for (const m of models) {
    const row = tiers
      .map((t) => {
        const s = mt[m]?.[t];
        if (!s) return "—";
        return `${pct(s.accuracy)}/${pct(s.sensible_accuracy)}`;
      })
      .map((s) => s.padStart(16))
      .join("");
    console.log(`  ${m.padEnd(30)} ${row}`);
  }

  console.log("\nmodel × category (strict accuracy)");
  const cats = Array.from(new Set(results.map((r) => r.category))).sort();
  console.log(
    `  ${"model".padEnd(30)} ${cats.map((c) => c.padStart(10)).join("")}`,
  );
  for (const m of models) {
    const row = cats
      .map((c) => (mc[m]?.[c] ? pct(mc[m]![c]!.accuracy) : "—"))
      .map((s) => s.padStart(10))
      .join("");
    console.log(`  ${m.padEnd(30)} ${row}`);
  }

  console.log("\ntop confusions (expected → picked, count)");
  const flat: Array<[string, string, number]> = [];
  for (const [exp, picks] of Object.entries(conf)) {
    for (const [p, n] of Object.entries(picks)) {
      flat.push([exp, p, n]);
    }
  }
  flat.sort((a, b) => b[2] - a[2]);
  for (const [exp, p, n] of flat.slice(0, 15)) {
    console.log(`  ${n}x  ${exp}  →  ${p}`);
  }

  console.log("=".repeat(80));
}

export function toJSON(results: CaseResult[]) {
  return {
    generated_at: new Date().toISOString(),
    overall: scoreboard(results),
    model_tier: modelTierMatrix(results),
    model_category: modelCategoryMatrix(results),
    confusion: confusion(results),
    cost_usd: costUsd(results),
    results,
  };
}
