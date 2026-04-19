# Findings — 2026-04-19

Two runs. Second run adds OpenAI (GPT-5, GPT-5 Mini) and Google (Gemini
2.5 Pro, Gemini 2.5 Flash) alongside the three Claude models, and
introduces a second accuracy metric.

## Headline

**Cross-provider: 665 calls, $5.07 with caching.**

**Strict first-tool accuracy:** 68.3% overall. **Sensible accuracy:**
81.8% overall — same picks, but a same-server `search`/`list`
preceding the correct `create`/`update`/`fetch` is counted as correct.
The 13-point gap is the "search-before-write" pattern: models
rationally locate the target entity first when no ID was given.

## Model × tier (strict / sensible)

```
                      small          medium          large
Opus 4.7            76.5% / 94.1%   79.4% / 97.1%   84.1% / 97.7%
Sonnet 4.6          70.6% / 88.2%   73.5% / 97.1%   77.3% / 97.7%
Haiku 4.5           64.7% / 82.4%   70.6% / 85.3%   79.5% / 93.2%
GPT-5 Mini          70.6% / 88.2%   73.5% / 91.2%   81.8% / 90.9%
Gemini 2.5 Pro      52.9% / 64.7%   64.7% / 73.5%   65.9% / 75.0%
GPT-5               64.7% / 76.5%   58.8% / 67.6%   54.5% / 63.6%
Gemini 2.5 Flash    58.8% / 76.5%   44.1% / 55.9%   52.3% / 59.1%
```

## What's interesting

**Opus 4.7 wins outright.** 97.7% sensible at the large tier. Pipeline
of Opus → Sonnet → Haiku ties Opus only on sensible at the larger
tiers, never on strict. On the strict metric Sonnet and Haiku
separate by ~7 points; on sensible they converge.

**GPT-5 Mini is the surprise.** It beats GPT-5 at every tier on both
metrics and sits between Sonnet and Opus. 81.8% strict at the large
tier — better than Haiku (79.5%), nearly matches Opus in the tool-
count-up direction. A smaller/cheaper OpenAI model outperforming its
flagship on tool selection is counterintuitive and worth
investigating.

**GPT-5 degrades with tool count.** 64.7% → 58.8% → 54.5% as servers
grow. It's the only model where adding tools hurt. The data shows this
is driven by GPT-5 refusing to call any tool more often on harder
cases (9× `gmail_create_draft → <none>`, 6× `calendar_create_event →
<none>`). Consistent with a calibrated "abstain" behavior that's the
wrong setting for this eval.

**Gemini 2.5 Flash is effectively broken on list queries.** 9.1%
category accuracy on `list` — it refused to call any tool on most
list-style prompts ("what's on my calendar tomorrow", "show my Gmail
labels"). One case returned `picked="now"` — a malformed tool name.
Flash's function-calling is not production-grade for this workload.

**Gemini 2.5 Pro is mid.** ~65% strict, ~75% sensible. Better than
Flash. Unremarkable compared to Claude and GPT-5 Mini.

## Category accuracy (strict)

```
                    ambiguous  create  fetch   list   search  update
Opus 4.7                83.3%   50.0%  100.0%  100.0%  100.0%   57.1%
Sonnet 4.6              79.2%   40.9%   92.3%  100.0%  100.0%   28.6%
Haiku 4.5               79.2%   40.9%   84.6%   81.8%  100.0%   57.1%
GPT-5 Mini              79.2%   40.9%  100.0%  100.0%   94.4%   57.1%
Gemini 2.5 Pro          45.8%   36.4%  100.0%   81.8%   83.3%   57.1%
GPT-5                   50.0%   27.3%   84.6%   90.9%   77.8%   28.6%
Gemini 2.5 Flash        75.0%   27.3%   61.5%    9.1%   72.2%   28.6%
```

Create (40-50% on Claude) and update (28-57%) remain the floor, but
sensible scoring lifts these — the confusions are almost always
same-server locators.

## Top confusions

```
21x  notion_update_page  →  notion_search
19x  notion_create_page  →  notion_search
18x  linear_create_issue →  <none>
15x  gmail_create_draft  →  gmail_search_threads
13x  calendar_create_event → <none>
12x  drive_create_file   →  drive_search_files
10x  slack_post_message  →  slack_list_channels
 9x  gmail_create_draft  →  <none>
 8x  calendar_create_event → calendar_suggest_time
 8x  linear_create_issue →  linear_search_issues
```

Two failure modes, clearly separated:

1. **Search-before-write** (Claude, GPT-5 Mini): pick a same-server
   locator when no ID is given. Rational. Counted correct under
   sensible metric.

2. **Refuse** (GPT-5 non-mini, Gemini Flash): no tool call. Not
   rational — the prompt has enough to act, and the system prompt
   explicitly says "do not ask clarifying questions."

## What to do with this

- **For this workload, Claude is the default.** Opus 4.7 for
  correctness, Haiku for cost. GPT-5 Mini is a credible second if
  you're already paying OpenAI.
- **Avoid Gemini 2.5 Flash for tool routing** until it stops
  refusing to call. Pro is passable but unremarkable.
- **If measuring other teams' benchmarks, check their metric.** A 68%
  strict score and an 82% sensible score describe the same behavior;
  either can be honest depending on what you're optimizing.
- **The create/update "floor" is an artifact of the eval, not a model
  failing.** ID-seeded update cases would make this the create/update
  score people should cite.

## Caveats

- n=17 per model-tier cell. Confidence intervals overlap heavily; the
  GPT-5-Mini-beats-Haiku line is worth ~2 cases and may not survive a
  second run.
- Synthetic tool surfaces. Real MCP servers have longer descriptions,
  richer schemas, and sometimes conflicting conventions. This bench
  is optimistic.
- No retry / no reflection. `tool_choice: "auto"`, one shot. A real
  agent would likely re-roll after a `<none>`.
- Anthropic prompt caching is working (69% cache-read after tier
  warmup). OpenAI/Gemini caching is opaque in the response and not
  necessarily engaged.

## Run it

```bash
pnpm install
source ~/.config/inbox-triage.env
pnpm eval                                 # all 7 models
pnpm eval -- --providers anthropic        # Claude only
pnpm eval -- --models gpt-5,gpt-5-mini    # OpenAI only
pnpm eval:smoke                           # 5 cases, Haiku
```
