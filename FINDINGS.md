# Findings — Anthropic run, 2026-04-19

First run. 44 cases, 3 server-count tiers, 3 Claude models, 285 calls,
$3.05 with prompt caching on the tool-surface + system prompt.

## Headline

**77.5% overall first-tool accuracy.** Opus 4.7 leads at the large tier
(10 servers, ~37 tools) with 84.1% — the only point where it pulls
cleanly ahead of Sonnet and Haiku. At the small tier (3 servers) all
three models tie at 76.5%: the contest is decided by category mix, not
tool-surface size.

## Model × tier

```
                  small   medium   large
opus-4-7          76.5%   79.4%   84.1%
sonnet-4-6        76.5%   73.5%   77.3%
haiku-4-5         76.5%   70.6%   79.5%
```

Opus is the only model whose accuracy rises monotonically with tool
count. Sonnet and Haiku dip at medium — likely because medium adds
Linear + Todoist, which pull "create a ticket"-type queries into a
three-way tie between Linear, Todoist, and (in Todoist's absence)
Slack.

## Model × category

```
                  ambiguous  create  fetch   list   search  update
opus-4-7              83.3%   50.0%  100.0%  100.0%  100.0%   57.1%
sonnet-4-6            83.3%   40.9%   92.3%  100.0%  100.0%   28.6%
haiku-4-5             83.3%   40.9%   84.6%   90.9%  100.0%   57.1%
```

Search and list are solved. Fetch (given an ID) is solved on Opus,
near-solved on the rest. **Create and update are the floor — and
they're the floor for reasons that aren't really the model's fault.**

## The create/update cliff isn't what it looks like

The top confusions in the data are these:

```
9x  notion_create_page  →  notion_search
9x  gmail_create_draft  →  gmail_search_threads
9x  notion_update_page  →  notion_search
6x  slack_post_message  →  slack_list_channels
6x  drive_create_file   →  drive_search_files
5x  calendar_create_event → calendar_suggest_time
5x  linear_create_issue → linear_search_issues
```

Every one of these is the same shape: the query named a write action
on an entity the model doesn't have an ID for, and the model's first
tool was a same-server locator. _"Put a new page under the Engineering
workspace"_ → Notion search. _"Reply to Maya's thread"_ → Gmail search.
_"Post in #launches"_ → Slack list channels. _"File a Linear ticket"_
→ Linear search.

These are rational first steps, not misclassifications. But a
first-tool-accuracy metric can't tell them apart from genuine routing
errors.

## What to change

**The eval isn't wrong — the metric is.** Two fixes would make the
signal cleaner:

1. **Provide IDs where IDs exist.** _"Update the Notion page at ID
   12345 — add an Action items section"_ removes the search-first
   excuse. Update-category accuracy would roughly double.

2. **Add a second score.** Call it _sensible accuracy_: first tool is
   either correct or a same-server `search`/`list` that plausibly
   precedes the correct `create`/`update`/`fetch`. That score probably
   lands in the 85–95% range across all three models and isolates true
   routing errors (like the 1× `figma_get_design_context →
drive_search_files`, which is a real miss).

The second change is a report.ts-only edit and was planned for this
commit. It didn't land.

## Ambiguous category

83.3% across all three models. The trap cases mostly worked:
_"Find the figma link — I think it was in an email from Jen"_ went to
Gmail, not Figma, on every model. The losses were on cases like
_"Write up a ticket for the checkout bug, then post it in
#engineering"_, where the model chose Linear first 50% of the time and
Slack first 50%. Both are defensible — the prompt underspecifies
ordering.

## Open questions

- **Does this pattern hold across providers?** The planned v2 adds
  GPT-5/GPT-5-mini and Gemini 2.5 Pro/Flash. Those providers expose
  function-calling differently (OpenAI: `function.parameters`; Gemini:
  `functionDeclarations`), and it's not obvious whether OpenAI's
  confidence-calibrated `tool_choice: "auto"` picks _earlier_ in a
  multi-step chain than Claude does. That would bias the strict metric
  the other way.

- **Does namespacing help?** All current tool names are flat —
  `notion_search`, `gmail_search_threads`. The confusion matrix
  suggests it wouldn't help much: models rarely cross server
  boundaries. But a `notion.search` / `gmail.search` format might
  reduce the 1-in-N noise on search-vs-search collisions (e.g. the
  case where Opus picked `slack_search_messages` for an ambiguous
  "find rate limiter" query in the medium tier).

- **How much of the small-tier tie is random?** 3 servers × 17 runnable
  cases × 3 models = 51 data points per tier, n≈17 per cell. Opus
  medium-vs-large separation (79.4% → 84.1%) is ~2 cases. These
  confidence intervals overlap heavily.

## Cost

$3.05 total for 285 calls. Cache-read tokens were 69% of input tokens
after the first tier warmed the cache. Without caching, cost would
have been closer to $10.
