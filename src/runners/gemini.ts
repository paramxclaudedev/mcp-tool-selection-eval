import { GoogleGenAI, Type, type FunctionDeclaration } from "@google/genai";
import type { Query, Runner, RunnerResult, ToolSchema } from "../types.ts";

const SYSTEM_PROMPT = `You are an assistant with access to MCP tools spanning personal productivity (WHOOP, Todoist, Notion, Gmail, Calendar, Slack). When the user asks for something that is best served by one of the available tools, call the single most appropriate tool with correct parameters. When no tool applies, respond with text. Prefer a single, precise tool call over multiple speculative ones. Do not invent tools that are not listed.`;

function toGemini(tool: ToolSchema): FunctionDeclaration {
  return {
    name: tool.name,
    description: tool.description,
    parameters: geminiSchema(tool.input_schema),
  };
}

type GProp = { type: Type; items?: GProp; description?: string };

function geminiSchema(
  s: ToolSchema["input_schema"],
): FunctionDeclaration["parameters"] {
  const props: Record<string, GProp> = {};
  for (const [k, v] of Object.entries(s.properties ?? {})) {
    props[k] = propSchema(v as Record<string, unknown>);
  }
  return {
    type: Type.OBJECT,
    properties: props,
    required: s.required ?? [],
  };
}

function propSchema(v: Record<string, unknown>): GProp {
  const t = (v.type as string) ?? "string";
  const mapped = mapType(t);
  if (mapped === Type.ARRAY) {
    const items = (v.items as Record<string, unknown>) ?? { type: "string" };
    return { type: Type.ARRAY, items: propSchema(items) };
  }
  return { type: mapped };
}

function mapType(t: string): Type {
  if (t === "number") return Type.NUMBER;
  if (t === "integer") return Type.INTEGER;
  if (t === "boolean") return Type.BOOLEAN;
  if (t === "array") return Type.ARRAY;
  if (t === "object") return Type.OBJECT;
  return Type.STRING;
}

export function makeGeminiRunner(model: string): Runner {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  return {
    model,
    async run(query: Query, flatTools: ToolSchema[]): Promise<RunnerResult> {
      const functionDeclarations = flatTools.map(toGemini);
      const started = Date.now();

      try {
        const resp = await ai.models.generateContent({
          model,
          contents: [{ role: "user", parts: [{ text: query.prompt }] }],
          config: {
            systemInstruction: SYSTEM_PROMPT,
            tools: [{ functionDeclarations }],
          },
        });
        const latency_ms = Date.now() - started;

        const calls = resp.functionCalls ?? [];
        const first = calls[0] ?? null;
        const text = (resp.text ?? "").trim() || null;
        const u = resp.usageMetadata ?? {};
        const input = u.promptTokenCount ?? 0;
        const output = u.candidatesTokenCount ?? 0;
        const inPrice = model.includes("pro") ? 1.25 : 0.1;
        const outPrice = model.includes("pro") ? 10 : 0.4;

        return {
          query_id: query.id,
          model,
          first_tool: first?.name ?? null,
          first_args: (first?.args as Record<string, unknown>) ?? null,
          text_only_response: calls.length === 0 ? text : null,
          num_tool_calls: calls.length,
          latency_ms,
          input_tokens: input,
          output_tokens: output,
          cache_read_tokens: 0,
          cache_write_tokens: 0,
          cost_usd:
            (input / 1_000_000) * inPrice + (output / 1_000_000) * outPrice,
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
