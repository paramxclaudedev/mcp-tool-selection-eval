import type { ScoredRow } from "./types.ts";

export type ModelSummary = {
  model: string;
  n: number;
  tool_correct_pct: number;
  tool_in_any_of_pct: number;
  avg_param_score: number;
  avg_latency_ms: number;
  total_cost_usd: number;
  total_tokens: number;
  cache_hit_rate: number;
  by_category: Record<
    string,
    { n: number; tool_correct_pct: number; avg_param_score: number }
  >;
};

export function summarize(rows: ScoredRow[]): ModelSummary[] {
  const byModel = new Map<string, ScoredRow[]>();
  for (const r of rows) {
    if (!byModel.has(r.model)) byModel.set(r.model, []);
    byModel.get(r.model)!.push(r);
  }

  const summaries: ModelSummary[] = [];
  for (const [model, list] of byModel) {
    const n = list.length;
    const correct = list.filter((r) => r.tool_correct).length;
    const anyOf = list.filter((r) => r.tool_in_any_of).length;
    const paramSum = list.reduce((a, r) => a + r.param_score, 0);
    const latencySum = list.reduce((a, r) => a + r.latency_ms, 0);
    const costSum = list.reduce((a, r) => a + r.cost_usd, 0);
    const inputTok = list.reduce((a, r) => a + r.input_tokens, 0);
    const outputTok = list.reduce((a, r) => a + r.output_tokens, 0);
    const cacheRead = list.reduce((a, r) => a + r.cache_read_tokens, 0);
    const cacheWrite = list.reduce((a, r) => a + r.cache_write_tokens, 0);
    const cacheDenom = cacheRead + cacheWrite + inputTok;

    const byCat: ModelSummary["by_category"] = {};
    for (const r of list) {
      const c =
        (r as unknown as { category?: string }).category ?? "uncategorized";
      if (!byCat[c])
        byCat[c] = { n: 0, tool_correct_pct: 0, avg_param_score: 0 };
      byCat[c].n += 1;
      byCat[c].tool_correct_pct += r.tool_correct ? 1 : 0;
      byCat[c].avg_param_score += r.param_score;
    }
    for (const c of Object.keys(byCat)) {
      const v = byCat[c]!;
      v.tool_correct_pct = (v.tool_correct_pct / v.n) * 100;
      v.avg_param_score = v.avg_param_score / v.n;
    }

    summaries.push({
      model,
      n,
      tool_correct_pct: (correct / n) * 100,
      tool_in_any_of_pct: (anyOf / n) * 100,
      avg_param_score: paramSum / n,
      avg_latency_ms: latencySum / n,
      total_cost_usd: costSum,
      total_tokens: inputTok + outputTok + cacheRead + cacheWrite,
      cache_hit_rate: cacheDenom > 0 ? cacheRead / cacheDenom : 0,
      by_category: byCat,
    });
  }

  summaries.sort((a, b) => b.tool_correct_pct - a.tool_correct_pct);
  return summaries;
}
