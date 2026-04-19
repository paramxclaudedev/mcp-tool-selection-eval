# mcp-tool-selection-eval

> Does your agent pick the right tool on the first try — and does that degrade as you connect more servers?

665 calls across 7 frontier models. $5.07 with prompt caching.

## Results

Sensible first-tool accuracy by model × server-count tier:

| Model            | small (3 srv) | medium (7 srv) | large (10 srv) |
| ---------------- | ------------: | -------------: | -------------: |
| **Opus 4.7**     |         94.1% |          97.1% |      **97.7%** |
| **Sonnet 4.6**   |         88.2% |          97.1% |      **97.7%** |
| Haiku 4.5        |         82.4% |          85.3% |          93.2% |
| GPT-5 Mini       |         88.2% |          91.2% |          90.9% |
| Gemini 2.5 Pro   |         64.7% |          73.5% |          75.0% |
| GPT-5            |         76.5% |          67.6% |          63.6% |
| Gemini 2.5 Flash |         76.5% |          55.9% |          59.1% |

**Key findings:**

- **Claude dominates.** Opus 4.7 and Sonnet 4.6 tie at 97.7% sensible accuracy across 37 tools. Haiku 4.5 at 93.2% is the cost champion — GPT-5 Mini quality at a fraction of the price.
- **GPT-5 Mini beats GPT-5 at every tier on both metrics.** The flagship degrades 64.7% → 54.5% as server count grows — the only model that gets _worse_ with more tools. Driven by refusals: GPT-5 returns `<none>` on 18+ create/update cases rather than committing to a call.
- **Gemini 2.5 Flash is broken on list queries.** 9.1% category accuracy on `list` — it refuses to call any tool on prompts like "show my Gmail labels." One response returned `picked="now"`, a malformed tool name. Not production-grade for this workload.
- **Sensible vs. strict gap is 13 points.** "Search-before-write" is rational behavior — locating the target entity before creating/updating it when no ID was given. Strict metrics that penalize it misrepresent real-world performance.

Strict vs. sensible breakdown and per-category confusion matrix in [FINDINGS.md](FINDINGS.md).

## Design

**10 synthetic MCP servers** (Notion, Gmail, Calendar, Drive, Slack, Linear, GitHub, Stripe, Figma, Todoist) with deliberate semantic overlap — the kind of tool-surface ambiguity real multi-server agents face.

**44 test cases** across six categories: `ambiguous`, `create`, `fetch`, `list`, `search`, `update`. Natural-language phrasings, no hints about which server to use.

**Three tiers** by server count:

| Tier   | Servers loaded | ~Tools |
| ------ | -------------- | ------ |
| small  | 3              | 12     |
| medium | 7              | 25     |
| large  | 10             | 37     |

**Two scoring metrics:**

- **Strict** — first `tool_use` must be in the accepted-answer set.
- **Sensible** — a same-server `search`/`list` preceding the correct `create`/`update`/`fetch` also counts.

`tool_choice: "auto"`, single-shot, no retries. Prompt caching on system + tools array (69% cache-read after tier warmup, ~$5 vs ~$12 without).

## Run it

```bash
pnpm install
cp .env.example .env
# fill in ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY
pnpm eval                                 # all 7 models × 3 tiers (~665 calls)
pnpm eval -- --providers anthropic        # Claude only (cheaper)
pnpm eval -- --models gpt-5-mini          # single model
pnpm eval:smoke                           # 5 cases on Haiku (~$0.001)
```

## Why this exists

Public benchmarks for MCP tool-routing accuracy don't exist. This is the baseline degradation curve as the tool surface grows, and a map of where failure modes cluster. Relevant for any agent that routes real decisions — commits, calendar events, payments. Feeds directly into settlement correctness research for [Keep](https://github.com/paramxclaudedev).

## Caveats

- n=17 per model-tier cell. Confidence intervals overlap; the GPT-5-Mini-beats-Haiku margin is ~2 cases.
- Synthetic tool surfaces. Real MCP servers have longer descriptions and richer schemas — this bench is optimistic.
- No retry / no reflection. A production agent would re-roll after a `<none>`.
- OpenAI/Gemini prompt caching is opaque in the response and may not be engaged.

## License

MIT
