import { buildToolset } from "./servers.js";
import { CASES, SERVER_TIERS, type TestCase, type Tier } from "./cases.js";
import { call, MODELS, type ModelSpec } from "./providers.js";
import type Anthropic from "@anthropic-ai/sdk";

export { MODELS };
export type { ModelSpec };

export type RunInput = {
  spec: ModelSpec;
  tier: Tier;
  cases: TestCase[];
  concurrency: number;
};

export type CaseResult = {
  case_id: string;
  query: string;
  category: TestCase["category"];
  tier: Tier;
  model: string;
  provider: string;
  picked_tool: string | null;
  correct_tools: string[];
  correct: boolean;
  stop_reason: string | null;
  input_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  output_tokens: number;
  latency_ms: number;
  error?: string;
};

export async function runOneCase(
  spec: ModelSpec,
  tier: Tier,
  tools: Anthropic.Tool[],
  c: TestCase,
): Promise<CaseResult> {
  const started = Date.now();
  try {
    const r = await call(spec, tools, c.query);
    const correct = r.picked_tool ? c.correct.includes(r.picked_tool) : false;
    return {
      case_id: c.id,
      query: c.query,
      category: c.category,
      tier,
      model: spec.id,
      provider: spec.provider,
      picked_tool: r.picked_tool,
      correct_tools: c.correct,
      correct,
      stop_reason: r.stop_reason,
      input_tokens: r.input_tokens,
      cache_read_tokens: r.cache_read_tokens,
      cache_write_tokens: r.cache_write_tokens,
      output_tokens: r.output_tokens,
      latency_ms: Date.now() - started,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      case_id: c.id,
      query: c.query,
      category: c.category,
      tier,
      model: spec.id,
      provider: spec.provider,
      picked_tool: null,
      correct_tools: c.correct,
      correct: false,
      stop_reason: null,
      input_tokens: 0,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      output_tokens: 0,
      latency_ms: Date.now() - started,
      error: msg,
    };
  }
}

async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const delay = 750 * Math.pow(2, i);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

export async function runTier(input: RunInput): Promise<CaseResult[]> {
  const serverNames = SERVER_TIERS[input.tier];
  const tools = buildToolset([...serverNames]);
  const availableNames = new Set(tools.map((t) => t.name));
  const runnable = input.cases.filter((c) =>
    c.correct.some((name) => availableNames.has(name)),
  );
  const skipped = input.cases.length - runnable.length;
  if (skipped > 0) {
    process.stdout.write(
      `  [${input.spec.label}] ${input.tier}: skipping ${skipped} cases\n`,
    );
  }
  const results: CaseResult[] = [];
  let idx = 0;
  const workers = Array.from(
    { length: Math.max(1, input.concurrency) },
    async () => {
      while (idx < runnable.length) {
        const my = idx++;
        const c = runnable[my]!;
        const r = await withRetry(() =>
          runOneCase(input.spec, input.tier, tools, c),
        );
        results.push(r);
        process.stdout.write(
          `  [${input.spec.label.padEnd(16)}] ${input.tier.padEnd(6)} ${c.id} ${
            r.correct ? "ok " : r.error ? "err" : "miss"
          } picked=${r.picked_tool ?? "-"}\n`,
        );
      }
    },
  );
  await Promise.all(workers);
  results.sort((a, b) => a.case_id.localeCompare(b.case_id));
  return results;
}

export async function runAll(options: {
  specs: ModelSpec[];
  tiers: Tier[];
  cases: TestCase[];
  concurrency: number;
}): Promise<CaseResult[]> {
  const all: CaseResult[] = [];
  for (const spec of options.specs) {
    for (const tier of options.tiers) {
      const part = await runTier({
        spec,
        tier,
        cases: options.cases,
        concurrency: options.concurrency,
      });
      all.push(...part);
    }
  }
  return all;
}

export { CASES, SERVER_TIERS };
