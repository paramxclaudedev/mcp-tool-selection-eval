import Anthropic from "@anthropic-ai/sdk";
import { buildToolset, type ServerBundle } from "./servers.js";
import { CASES, SERVER_TIERS, type TestCase, type Tier } from "./cases.js";

export type ModelId =
  | "claude-opus-4-7"
  | "claude-sonnet-4-6"
  | "claude-haiku-4-5-20251001";

export const MODELS: ModelId[] = [
  "claude-opus-4-7",
  "claude-sonnet-4-6",
  "claude-haiku-4-5-20251001",
];

export type RunInput = {
  model: ModelId;
  tier: Tier;
  cases: TestCase[];
  concurrency: number;
};

export type CaseResult = {
  case_id: string;
  query: string;
  category: TestCase["category"];
  tier: Tier;
  model: ModelId;
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

const SYSTEM_PROMPT = `You are an assistant with access to tools from several connected MCP servers. Pick the single most appropriate tool to start with for each user request. If the request requires multiple tools, pick the one that should be called first. Prefer the tool whose description most closely matches the user's intent. Do not ask clarifying questions — make the best call from the information given.`;

function pickFirstToolUse(
  message: Anthropic.Messages.Message,
): { name: string } | null {
  for (const block of message.content) {
    if (block.type === "tool_use") return { name: block.name };
  }
  return null;
}

export async function runOneCase(
  client: Anthropic,
  model: ModelId,
  tier: Tier,
  tools: Anthropic.Tool[],
  c: TestCase,
): Promise<CaseResult> {
  const started = Date.now();
  try {
    const toolsWithCache = tools.map((t, i) =>
      i === tools.length - 1
        ? { ...t, cache_control: { type: "ephemeral" as const } }
        : t,
    );

    const message = await client.messages.create({
      model,
      max_tokens: 512,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      tools: toolsWithCache,
      tool_choice: { type: "auto" },
      messages: [{ role: "user", content: c.query }],
    });

    const picked = pickFirstToolUse(message);
    const correct = picked ? c.correct.includes(picked.name) : false;

    const usage = message.usage as Anthropic.Messages.Usage & {
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };

    return {
      case_id: c.id,
      query: c.query,
      category: c.category,
      tier,
      model,
      picked_tool: picked?.name ?? null,
      correct_tools: c.correct,
      correct,
      stop_reason: message.stop_reason,
      input_tokens: usage.input_tokens ?? 0,
      cache_read_tokens: usage.cache_read_input_tokens ?? 0,
      cache_write_tokens: usage.cache_creation_input_tokens ?? 0,
      output_tokens: usage.output_tokens ?? 0,
      latency_ms: Date.now() - started,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      case_id: c.id,
      query: c.query,
      category: c.category,
      tier,
      model,
      picked_tool: null,
      correct_tools: c.correct,
      correct: false,
      stop_reason: null,
      input_tokens: 0,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      output_tokens: 0,
      latency_ms: Date.now() - started,
      error: message,
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

export async function runTier(
  client: Anthropic,
  input: RunInput,
): Promise<CaseResult[]> {
  const serverNames = SERVER_TIERS[input.tier];
  const tools = buildToolset([...serverNames]);
  const availableNames = new Set(tools.map((t) => t.name));

  const runnable = input.cases.filter((c) =>
    c.correct.some((name) => availableNames.has(name)),
  );
  const skipped = input.cases.length - runnable.length;
  if (skipped > 0) {
    process.stdout.write(
      `  [${input.model}] ${input.tier}: skipping ${skipped} cases (correct tool not in tier)\n`,
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
          runOneCase(client, input.model, input.tier, tools, c),
        );
        results.push(r);
        process.stdout.write(
          `  [${input.model.padEnd(28)}] ${input.tier.padEnd(6)} ${c.id} ${
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
  client: Anthropic;
  models: ModelId[];
  tiers: Tier[];
  cases: TestCase[];
  concurrency: number;
}): Promise<CaseResult[]> {
  const all: CaseResult[] = [];
  for (const model of options.models) {
    for (const tier of options.tiers) {
      const part = await runTier(options.client, {
        model,
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
