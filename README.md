# mcp-tool-selection-eval

Given N MCP tools across M servers, does the model pick the right one first try?

## Headline result

**Across 350 rows × 7 models × 50 unique queries on a 44-tool catalog from 6 MCP servers, GPT-4o-mini wins first-try tool correctness at 92.0% (params 4.00/5, $0.008 total), Opus 4.7 and Sonnet 4.6 tie at 84.0% (params ~3.92/5), Haiku 4.5 lands 78.0%, GPT-4o 76.0%, Gemini 2.5 Pro 70.0%, and Gemini 2.5 Flash collapses to 46.0% — Flash breaks badly on multi_tool and clear_single queries.** Full run costs under $2 total with prompt caching >80% hit rate on the Claude models. Most first-try failures are "reasonable prep step, wrong gold tool" (searching before closing/sending) rather than hard misses.

## Why

When an assistant has 40+ tools across 6 MCP servers, tool selection becomes the bottleneck. A right answer with the wrong tool is still wrong. This eval measures first-try hit rate under realistic tool-catalog pressure.

## What's in it

- **6 MCP servers** (whoop, todoist, notion, gmail, calendar, slack) with **44 tools** total
- **50 gold-labeled queries** across 6 categories: clear_single, multi_tool, ambiguous, no_tool, adversarial, param_precision
- **3 Claude models** compared: Opus 4.7, Sonnet 4.6, Haiku 4.5
- **Claude-as-judge** (Opus) scores (a) tool correctness and (b) parameter fidelity 0–5
- **Prompt caching** on tools catalog + judge tool list → >90% cache-hit rate after warm-up, keeps cost under $1 for a full run
- Outputs Markdown report + CSV + raw JSONL

## Run

```bash
pnpm install
cp .env.example .env   # or rely on ~/.config/inbox-triage.env
pnpm typecheck
pnpm eval:smoke        # 5 queries, sanity check
pnpm eval              # full 50×3 = 150 rows
```

Reports land in `reports/runs/{timestamp}.{md,csv,jsonl}`.

## Adding more models

The runner interface is `(query, tools) => RunnerResult`. To add OpenAI or Gemini, implement a new `src/runners/<provider>.ts` that mirrors `anthropic.ts`, then push it into the runners array in `src/run.ts`. Pricing goes in `src/pricing.ts`.

## Query categories

| Category        | What it tests                                                                         |
| --------------- | ------------------------------------------------------------------------------------- |
| clear_single    | One obvious tool. Floor of competence.                                                |
| multi_tool      | User intent spans two tools. Measures which the model calls first.                    |
| ambiguous       | Multiple defensible tools (`gold_any_of` has >1). Judge scores charity.               |
| no_tool         | Pure chat — model should NOT call a tool.                                             |
| adversarial     | User names a tool/service that isn't available. Model should refuse, not approximate. |
| param_precision | Right tool is easy; right args (Gmail operators, date math, filter syntax) is hard.   |

## Scoring

- `tool_correct` (bool) — first tool call matches `gold_tool` exactly (or `NONE` matched text-only reply)
- `tool_in_any_of` (bool) — first tool call is in `gold_any_of` (lenient)
- `param_score` (0–5) — judge rubric: correctness of filter strings, date ranges, operators, required fields

## Design decisions

- **First-call only.** Real MCP clients often execute the first tool call before reconsidering. Measuring first-try keeps the signal clean.
- **One SYSTEM prompt for all models.** Same tools block, same user prompt. If a model needs provider-specific priming, that's part of what we're measuring.
- **Judge sees the tool catalog.** So it can assess "was there a better tool" rather than only matching strings.
- **No function calls are actually executed.** The eval measures selection, not execution. Mock responses would add noise without signal.

## File map

- `fixtures/tools.json` — tool catalog (edit to expand)
- `fixtures/queries.jsonl` — gold set (one JSON per line)
- `src/runners/anthropic.ts` — Claude runner with prompt caching
- `src/judge.ts` — Opus-as-judge
- `src/score.ts` — aggregation
- `src/report.ts` — markdown + CSV output
- `src/run.ts` — orchestrator
