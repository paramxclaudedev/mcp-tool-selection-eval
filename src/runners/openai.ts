import OpenAI from "openai";
import type { Query, Runner, RunnerResult, ToolSchema } from "../types.ts";

const SYSTEM_PROMPT = `You are an assistant with access to MCP tools spanning personal productivity (WHOOP, Todoist, Notion, Gmail, Calendar, Slack). When the user asks for something that is best served by one of the available tools, call the single most appropriate tool with correct parameters. When no tool applies, respond with text. Prefer a single, precise tool call over multiple speculative ones. Do not invent tools that are not listed.`;

const PRICING: Record<string, { in: number; out: number; cache: number }> = {
  "gpt-4o": { in: 2.5, out: 10, cache: 1.25 },
  "gpt-4o-mini": { in: 0.15, out: 0.6, cache: 0.075 },
  "gpt-5": { in: 5, out: 20, cache: 2.5 },
  "gpt-5-mini": { in: 1, out: 4, cache: 0.5 },
};

export function makeOpenAIRunner(model: string): Runner {
  const client = new OpenAI();

  return {
    model,
    async run(query: Query, flatTools: ToolSchema[]): Promise<RunnerResult> {
      const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = flatTools.map(
        (t) => ({
          type: "function",
          function: {
            name: t.name,
            description: t.description,
            parameters: t.input_schema as unknown as Record<string, unknown>,
          },
        }),
      );

      const started = Date.now();
      try {
        const resp = await client.chat.completions.create({
          model,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: query.prompt },
          ],
          tools,
          tool_choice: "auto",
        });
        const latency_ms = Date.now() - started;

        const msg = resp.choices[0]?.message;
        const toolCalls = msg?.tool_calls ?? [];
        const first = toolCalls[0];
        const u = resp.usage;
        const input = u?.prompt_tokens ?? 0;
        const output = u?.completion_tokens ?? 0;
        const cacheRead =
          (u as { prompt_tokens_details?: { cached_tokens?: number } })
            ?.prompt_tokens_details?.cached_tokens ?? 0;
        const p = PRICING[model] ?? PRICING["gpt-4o"]!;

        let firstName: string | null = null;
        let firstArgs: Record<string, unknown> | null = null;
        if (first && first.type === "function") {
          firstName = first.function.name;
          try {
            firstArgs = JSON.parse(first.function.arguments || "{}");
          } catch {
            firstArgs = { _raw: first.function.arguments };
          }
        }

        return {
          query_id: query.id,
          model,
          first_tool: firstName,
          first_args: firstArgs,
          text_only_response:
            toolCalls.length === 0 ? (msg?.content ?? null) : null,
          num_tool_calls: toolCalls.length,
          latency_ms,
          input_tokens: input - cacheRead,
          output_tokens: output,
          cache_read_tokens: cacheRead,
          cache_write_tokens: 0,
          cost_usd:
            ((input - cacheRead) / 1_000_000) * p.in +
            (cacheRead / 1_000_000) * p.cache +
            (output / 1_000_000) * p.out,
          error: null,
        };
      } catch (err) {
        return {
          query_id: query.id,
          model,
          first_tool: null,
          first_args: null,
          text_only_response: null,
          num_tool_calls: 0,
          latency_ms: Date.now() - started,
          input_tokens: 0,
          output_tokens: 0,
          cache_read_tokens: 0,
          cache_write_tokens: 0,
          cost_usd: 0,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  };
}
