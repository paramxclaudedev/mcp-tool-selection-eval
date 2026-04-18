# mcp-tool-selection-eval

**Does Claude pick the right MCP tool on the first try?**

As users connect more MCP servers to Claude, tool surfaces start to overlap. Many servers expose a `search`, a `create_*`, a `list_*`, a `get_*`. When a user says _"find the Q3 doc"_, does the model reach for `notion_search`, `drive_search_files`, or `gmail_search_threads`? Does accuracy hold as the number of connected servers grows?

This suite measures that, across three Claude models and three server-count tiers.

## What it measures

- **First-tool accuracy** — of the tool-use blocks the model emits for a query, is the first one in the accepted-answer set?
- **Degradation with scale** — accuracy at 3 vs. 7 vs. 10 connected servers (`small` / `medium` / `large`).
- **Per-category accuracy** — search, create, fetch, update, list, ambiguous.
- **Confusion matrix** — when wrong, which tool does the model pick instead?
- **Cost + latency** — token usage and p50 latency per model.

## Setup

```bash
pnpm install
cp .env.example .env
# set ANTHROPIC_API_KEY
```

## Run

```bash
# full run: all 45 cases × 3 tiers × 3 models = 405 calls
pnpm eval

# smoke run: 5 cases, smallest tier, Haiku only
pnpm eval:smoke

# just one model
pnpm eval -- --models claude-haiku-4-5-20251001

# just one tier
pnpm eval -- --tiers large

# adjust concurrency (default 4)
pnpm eval -- --concurrency 8
```

Results are written to `results/run-<timestamp>.json` and a scoreboard is printed to stdout.

## Design

### Test corpus

`src/cases.ts` holds 45 prompts spread across six categories. Each case has one or more acceptable tool names. Ambiguous cases accept multiple — the model is scored correct if its first pick is in the set.

Key design calls:

- **Natural phrasing.** User prompts are what a human would actually type, not keyword-rich queries.
- **Traps included.** E.g. _"Find the figma link — I think it was in an email from Jen"_ — the word "figma" appears but the correct call is Gmail search.
- **First-tool semantics.** We score the first `tool_use` block the model emits, even if it plans a multi-step sequence. For composite tasks ("file a ticket then post it"), the correct answer is the first action.

### Server surface

`src/servers.ts` defines 10 synthetic-but-realistic MCP servers modeled on Notion, Gmail, Calendar, Drive, Slack, Linear, GitHub, Stripe, Figma, Todoist. Tool descriptions are written in the style real MCP servers publish — verbose enough to disambiguate, but with deliberate semantic overlap where real surfaces overlap.

Tiers:

| Tier   | Servers loaded            | Total tools |
| ------ | ------------------------- | ----------- |
| small  | 3 (notion/gmail/calendar) | ~12         |
| medium | 7                         | ~25         |
| large  | 10 (all)                  | ~37         |

### Model parameters

- `tool_choice: "auto"` — the model is free to not call a tool, or to call several. We take the first.
- `max_tokens: 512` — enough for a tool call + a short preamble.
- No retries for wrong answers. The eval is single-shot by design — it measures the first-try decision.
- **Prompt caching** is enabled on both `system` and on the last tool in the tools array, so the ~40-tool surface is cached across all 45 cases per tier. Meaningful cost reduction.

## Output

The JSON written to `results/` contains:

```jsonc
{
  "generated_at": "…",
  "overall": { "total": 405, "correct": 312, "accuracy": 0.77, "errors": 0 },
  "model_tier":    { "claude-opus-4-7": { "small": { … }, "medium": { … }, … }, … },
  "model_category": { … },
  "confusion": { "notion_search": { "drive_search_files": 4, … }, … },
  "cost_usd": 0.42,
  "results": [ /* per-case rows */ ]
}
```

The stdout report shows the model × tier matrix, the model × category matrix, and the top confusions.

## Why this matters

MCP's promise is that any server composes with any other. In practice, the more servers you attach, the more disambiguation work the model has to do — and nobody has published numbers on how much that hurts. This is a first swing at establishing a baseline.

Improvements welcome:

- More cases per category.
- Human-written real-user queries (open a PR with a `cases_real_users.ts`).
- A "retrieved tools only" treatment — grep a registry for the query and attach the top-k, like Claude Code's ToolSearch pattern.
- A "namespaced vs. flat" treatment — does prefixing (`notion.search`, `gmail.search`) help?

## License

MIT.
