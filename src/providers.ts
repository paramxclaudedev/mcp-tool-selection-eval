import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";

export type Provider = "anthropic" | "openai" | "gemini";

export type ModelSpec = {
  id: string;
  provider: Provider;
  label: string;
};

export const MODELS: ModelSpec[] = [
  { id: "claude-opus-4-7", provider: "anthropic", label: "Opus 4.7" },
  { id: "claude-sonnet-4-6", provider: "anthropic", label: "Sonnet 4.6" },
  {
    id: "claude-haiku-4-5-20251001",
    provider: "anthropic",
    label: "Haiku 4.5",
  },
  { id: "gpt-5", provider: "openai", label: "GPT-5" },
  { id: "gpt-5-mini", provider: "openai", label: "GPT-5 Mini" },
  { id: "gemini-2.5-pro", provider: "gemini", label: "Gemini 2.5 Pro" },
  { id: "gemini-2.5-flash", provider: "gemini", label: "Gemini 2.5 Flash" },
];

export type CallResult = {
  picked_tool: string | null;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  stop_reason: string | null;
  error?: string;
};

type AnthropicTool = Anthropic.Tool;

const SYSTEM_PROMPT = `You are an assistant with access to tools from several connected MCP servers. Pick the single most appropriate tool to start with for each user request. If the request requires multiple tools, pick the one that should be called first. Prefer the tool whose description most closely matches the user's intent. Do not ask clarifying questions — make the best call from the information given.`;

let _anthropic: Anthropic | null = null;
let _openai: OpenAI | null = null;
let _gemini: GoogleGenAI | null = null;

function anthropicClient(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic();
  return _anthropic;
}
function openaiClient(): OpenAI {
  if (!_openai) _openai = new OpenAI();
  return _openai;
}
function geminiClient(): GoogleGenAI {
  if (!_gemini)
    _gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return _gemini;
}

export async function callAnthropic(
  model: string,
  tools: AnthropicTool[],
  userPrompt: string,
): Promise<CallResult> {
  const client = anthropicClient();
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
    messages: [{ role: "user", content: userPrompt }],
  });
  let picked: string | null = null;
  for (const block of message.content) {
    if (block.type === "tool_use") {
      picked = block.name;
      break;
    }
  }
  const usage = message.usage as Anthropic.Messages.Usage & {
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  return {
    picked_tool: picked,
    stop_reason: message.stop_reason,
    input_tokens: usage.input_tokens ?? 0,
    output_tokens: usage.output_tokens ?? 0,
    cache_read_tokens: usage.cache_read_input_tokens ?? 0,
    cache_write_tokens: usage.cache_creation_input_tokens ?? 0,
  };
}

export async function callOpenAI(
  model: string,
  tools: AnthropicTool[],
  userPrompt: string,
): Promise<CallResult> {
  const client = openaiClient();
  const oaTools = tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema as Record<string, unknown>,
    },
  }));
  const resp = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    tools: oaTools,
    tool_choice: "auto",
    max_completion_tokens: 512,
  });
  const choice = resp.choices[0];
  const calls = choice?.message?.tool_calls ?? [];
  const first = calls[0];
  const picked =
    first && first.type === "function" ? first.function.name : null;
  const usage = resp.usage;
  const cachedIn =
    (usage?.prompt_tokens_details as { cached_tokens?: number } | undefined)
      ?.cached_tokens ?? 0;
  return {
    picked_tool: picked,
    stop_reason: choice?.finish_reason ?? null,
    input_tokens: (usage?.prompt_tokens ?? 0) - cachedIn,
    cache_read_tokens: cachedIn,
    cache_write_tokens: 0,
    output_tokens: usage?.completion_tokens ?? 0,
  };
}

type GeminiSchema = {
  type: string;
  description?: string;
  properties?: Record<string, GeminiSchema>;
  required?: string[];
  items?: GeminiSchema;
  enum?: string[];
};

function toGeminiSchema(s: unknown): GeminiSchema | undefined {
  if (!s || typeof s !== "object") return undefined;
  const src = s as Record<string, unknown>;
  const type = typeof src.type === "string" ? src.type.toUpperCase() : "OBJECT";
  const out: GeminiSchema = { type };
  if (typeof src.description === "string") out.description = src.description;
  if (src.properties && typeof src.properties === "object") {
    out.properties = {};
    for (const [k, v] of Object.entries(
      src.properties as Record<string, unknown>,
    )) {
      const g = toGeminiSchema(v);
      if (g) out.properties[k] = g;
    }
  }
  if (Array.isArray(src.required))
    out.required = src.required.filter(
      (r): r is string => typeof r === "string",
    );
  if (src.items) {
    const g = toGeminiSchema(src.items);
    if (g) out.items = g;
  }
  if (Array.isArray(src.enum))
    out.enum = src.enum.filter((e): e is string => typeof e === "string");
  return out;
}

export async function callGemini(
  model: string,
  tools: AnthropicTool[],
  userPrompt: string,
): Promise<CallResult> {
  const client = geminiClient();
  const functionDeclarations = tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: toGeminiSchema(t.input_schema) ?? { type: "OBJECT" },
  }));
  const resp = await client.models.generateContent({
    model,
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    config: {
      systemInstruction: SYSTEM_PROMPT,
      tools: [{ functionDeclarations } as never],
      toolConfig: {
        functionCallingConfig: { mode: "AUTO" },
      } as never,
      maxOutputTokens: 512,
    },
  });
  let picked: string | null = null;
  const parts = resp.candidates?.[0]?.content?.parts ?? [];
  for (const p of parts) {
    const fc = (p as { functionCall?: { name?: string } }).functionCall;
    if (fc?.name) {
      picked = fc.name;
      break;
    }
  }
  const usage = resp.usageMetadata;
  const cachedIn = usage?.cachedContentTokenCount ?? 0;
  return {
    picked_tool: picked,
    stop_reason: resp.candidates?.[0]?.finishReason ?? null,
    input_tokens: (usage?.promptTokenCount ?? 0) - cachedIn,
    cache_read_tokens: cachedIn,
    cache_write_tokens: 0,
    output_tokens: usage?.candidatesTokenCount ?? 0,
  };
}

export async function call(
  spec: ModelSpec,
  tools: AnthropicTool[],
  userPrompt: string,
): Promise<CallResult> {
  switch (spec.provider) {
    case "anthropic":
      return callAnthropic(spec.id, tools, userPrompt);
    case "openai":
      return callOpenAI(spec.id, tools, userPrompt);
    case "gemini":
      return callGemini(spec.id, tools, userPrompt);
  }
}
