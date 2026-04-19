# MCP tool-selection eval — overnight run, 2026-04-19

**Source:** `results/run.log` (parallel agent's overnight execution)
**Scope:** 285 calls (44 cases × 3 models × small/medium/large server tiers, with per-tier skips when the correct tool isn't loaded)
**Cost:** $4.00 across all three Claude models
**Errors:** 0 (no API failures, no tool-call format errors)

## Headline

|                             |                                                            |
| --------------------------- | ---------------------------------------------------------- |
| Overall first-tool accuracy | **76.8%** (219/285)                                        |
| Best model × tier           | Opus + large: **84.1%**                                    |
| Worst model × category      | Sonnet on `update`: **28.6%**                              |
| Most-frequent miss          | _create_ verbs misrouted to _search_ tools (39+ instances) |

## Model × tier accuracy

| Model             | small (~12 tools) | medium (~25) | large (~37) |
| ----------------- | ----------------: | -----------: | ----------: |
| claude-haiku-4-5  |             70.6% |        76.5% |       75.0% |
| claude-sonnet-4-6 |             70.6% |        73.5% |       77.3% |
| claude-opus-4-7   |             76.5% |        79.4% |   **84.1%** |

**Counter-intuitive finding:** accuracy goes _up_ as the tool surface grows. The hypothesis (more tools = more confusion = lower accuracy) is wrong for our cases. Two reasons:

1. Many cases needed a tool only present at medium/large — e.g. `github_create_pr`, `stripe_list_charges`. At small they were skipped (the eval drops cases when the correct tool isn't in the active tier).
2. The remaining cases at small are disproportionately the ambiguous/disambiguation ones, which are harder.

A cleaner test would hold the case set fixed and only vary the distractor count. Filed as future work.

## Model × category accuracy

| Model             | ambiguous | **create** |  fetch |   list | search | **update** |
| ----------------- | --------: | ---------: | -----: | -----: | -----: | ---------: |
| claude-haiku-4-5  |     83.3% |      45.5% |  84.6% |  81.8% |  94.4% |      57.1% |
| claude-opus-4-7   |     83.3% |      50.0% | 100.0% | 100.0% | 100.0% |      57.1% |
| claude-sonnet-4-6 |     79.2% |      40.9% |  92.3% | 100.0% | 100.0% |  **28.6%** |

**Key reading:** all three models are near-perfect on read-shaped operations (search, list, fetch ≥ 84%), and all three break on write-shaped operations (create ≤ 50%, update ≤ 57%). The break is not about model size — even Opus tops out at 50% on create.

## Why models break on writes — top confusions

| Count | Expected (correct)    | Picked instead         |
| ----: | --------------------- | ---------------------- |
|     9 | `notion_create_page`  | `notion_search`        |
|     9 | `gmail_create_draft`  | `gmail_search_threads` |
|     9 | `notion_update_page`  | `notion_search`        |
|     6 | `slack_post_message`  | `slack_list_channels`  |
|     6 | `linear_create_issue` | `linear_search_issues` |
|     6 | `drive_create_file`   | `drive_search_files`   |

A clear pattern: when given a write request and a server with overlapping read+write tools, the model defaults to the read tool of the same surface. The model "hedges" — it picks the lower-stakes operation as a first move even when the user explicitly asked to create, draft, post, or update.

This is consistent with the system prompt design (`tool_choice: auto`, `pick the single most appropriate tool to start with`), but it's a real disambiguation failure under that policy: in production, this would surface as the assistant confirming the recipient list before drafting, when the user wanted the draft itself.

## What this means for MCP server authors

1. **Tool descriptions matter on the verb axis, not just the noun axis.** `gmail_search_threads` and `gmail_create_draft` both have rich noun-domain language ("gmail", "threads", "drafts"); the model can tell which surface to use. The miss is on the verb — search vs. create. Tightening the verb language in the description ("Use this when the user asks you to draft a new message — never to look one up") is the cheapest available fix.
2. **Search tools eat their neighbors.** If you're shipping a server with both a search and a create tool, the search tool will absorb traffic intended for the create tool. Worth measuring on your own server: re-run this eval scoped to your tools and surface the confusion matrix.
3. **At least one tier-axis result is good news for ToolSearch-style retrieval:** large-tier accuracy actually improves with more distractors, suggesting the bottleneck is _category_ disambiguation, not _tool count_. A retrieval pre-filter that surfaces the top-k tools by vector similarity to the query would not help with the create-vs-search confusion (both are semantically close to the query) but might help on the ambiguous category.

## Methodology notes

- Each case scores the **first** `tool_use` block the model emits. Multi-step plans aren't penalized for downstream calls.
- Prompt caching enabled on the system prompt and the last tool definition — keeps marginal cost low across the 285 calls.
- Cases with `correct ⊆ tools(tier)=∅` are skipped per tier (44 → 17 small / 34 medium / 44 large after skips).

## Reproduce

```bash
cd /Users/p/Code/mcp-tool-selection-eval
source ~/.config/inbox-triage.env
pnpm install
pnpm eval
```

Results land in `results/run.log` + `results/run-<timestamp>.json`.

## Open extensions worth running next

1. **Namespaced tools** — does `notion.create_page` / `notion.search` (dotted) reduce the create→search confusion vs. flat `notion_create_page` / `notion_search`?
2. **ToolSearch retrieval treatment** — pre-filter to the top-5 tools by query similarity, then re-run. Compare against the no-retrieval baseline at the large tier.
3. **Verb-prefix descriptions** — rewrite create/update tool descriptions to start with "Use this to write/create/draft. Never to look up existing data." Does the create accuracy budge?
4. **Alternate phrasings per case** — three rewordings of each user query, score on the worst one.
