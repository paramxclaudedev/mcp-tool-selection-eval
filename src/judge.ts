import Anthropic from "@anthropic-ai/sdk";
import type { Query, RunnerResult, JudgeResult, ToolSchema } from "./types.ts";

const JUDGE_MODEL = "claude-opus-4-7";

const JUDGE_SYSTEM = `You are a strict evaluator of LLM tool-selection decisions. For each row you see a user prompt, the ground-truth acceptable tools, and the model's actual choice (tool name + args, or "NONE" if the model answered in text). Score two things independently:

1) tool_correct (boolean) — did the model's first tool call match the gold_tool OR one of gold_any_of? If the gold is "NONE" then the model should have produced a text reply with no tool call.

2) param_score (0-5) — how well did the model parameterize the call?
   5 = exactly right (correct query/filter/date range with expected operators)
   4 = right tool, minor arg flaw (e.g. slightly wrong date math, missing optional arg)
   3 = right tool, coarse args but usable
   2 = right tool, wrong args
   1 = picked wrong tool but with parseable args
   0 = no tool called when one was expected, or tool doesn't exist

Return ONLY a strict JSON object with keys: tool_correct (bool), tool_in_any_of (bool), param_score (0-5 int), justification (string, <=40 words). No prose outside JSON.`;

export async function judgeRow(
  client: Anthropic,
  query: Query,
  result: RunnerResult,
  toolCatalog: ToolSchema[],
): Promise<JudgeResult> {
  const catalogSummary = toolCatalog
    .map((t) => `- ${t.name}: ${t.description}`)
    .join("\n");

  const payload = {
    query_id: query.id,
    category: query.category,
    prompt: query.prompt,
    gold_tool: query.gold_tool,
    gold_any_of: query.gold_any_of,
    notes: query.notes ?? "",
    actual_tool: result.first_tool ?? "NONE",
    actual_args: result.first_args ?? {},
    actual_text_reply: result.text_only_response ?? "",
  };

  const resp = await client.messages.create({
    model: JUDGE_MODEL,
    max_tokens: 512,
    system: [
      {
        type: "text",
        text: JUDGE_SYSTEM,
      },
      {
        type: "text",
        text: `TOOL CATALOG:\n${catalogSummary}`,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `Evaluate this row. Return JSON only.\n\n${JSON.stringify(payload, null, 2)}`,
      },
    ],
  });

  const text = resp.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return {
      query_id: query.id,
      model: result.model,
      tool_correct: false,
      tool_in_any_of: false,
      param_score: 0,
      justification: `Judge returned non-JSON: ${text.slice(0, 120)}`,
    };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as {
      tool_correct: boolean;
      tool_in_any_of: boolean;
      param_score: number;
      justification: string;
    };
    return {
      query_id: query.id,
      model: result.model,
      tool_correct: Boolean(parsed.tool_correct),
      tool_in_any_of: Boolean(parsed.tool_in_any_of),
      param_score: Math.max(
        0,
        Math.min(5, Math.round(parsed.param_score)),
      ) as JudgeResult["param_score"],
      justification: String(parsed.justification ?? "").slice(0, 400),
    };
  } catch (err) {
    return {
      query_id: query.id,
      model: result.model,
      tool_correct: false,
      tool_in_any_of: false,
      param_score: 0,
      justification: `JSON parse failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
