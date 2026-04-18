import Anthropic from "@anthropic-ai/sdk";
import type { Query, Runner, RunnerResult, ToolSchema } from "../types.ts";
import { costUsd } from "../pricing.ts";

const SYSTEM_PROMPT = `You are an assistant with access to MCP tools spanning personal productivity (WHOOP, Todoist, Notion, Gmail, Calendar, Slack). When the user asks for something that is best served by one of the available tools, call the single most appropriate tool with correct parameters. When no tool applies, respond with text. Prefer a single, precise tool call over multiple speculative ones. Do not invent tools that are not listed.`;

export function makeAnthropicRunner(model: string): Runner {
  const client = new Anthropic();

  return {
    model,
    async run(query: Query, flatTools: ToolSchema[]): Promise<RunnerResult> {
      const tools = flatTools.map((t, i) => ({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema,
        ...(i === flatTools.length - 1
          ? { cache_control: { type: "ephemeral" as const } }
          : {}),
      }));

      const started = Date.now();
      try {
        const resp = await client.messages.create({
          model,
          max_tokens: 1024,
          system: [
            {
              type: "text",
              text: SYSTEM_PROMPT,
              cache_control: { type: "ephemeral" },
            },
          ],
          tools: tools as unknown as Anthropic.Messages.Tool[],
          messages: [{ role: "user", content: query.prompt }],
        });
        const latency_ms = Date.now() - started;

        const toolUses = resp.content.filter(
          (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use",
        );
        const textBlocks = resp.content.filter(
          (b): b is Anthropic.Messages.TextBlock => b.type === "text",
        );
        const first = toolUses[0] ?? null;
        const u = resp.usage;
        const cacheRead = u.cache_read_input_tokens ?? 0;
        const cacheWrite = u.cache_creation_input_tokens ?? 0;

        return {
          query_id: query.id,
          model,
          first_tool: first?.name ?? null,
          first_args: (first?.input as Record<string, unknown>) ?? null,
          text_only_response:
            toolUses.length === 0
              ? textBlocks.map((t) => t.text).join("\n") || null
              : null,
          num_tool_calls: toolUses.length,
          latency_ms,
          input_tokens: u.input_tokens,
          output_tokens: u.output_tokens,
          cache_read_tokens: cacheRead,
          cache_write_tokens: cacheWrite,
          cost_usd: costUsd(
            model,
            u.input_tokens,
            u.output_tokens,
            cacheRead,
            cacheWrite,
          ),
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
