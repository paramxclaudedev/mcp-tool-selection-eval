import { writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { ScoredRow } from "./types.ts";
import type { ModelSummary } from "./score.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

export async function writeReport(
  runId: string,
  rows: ScoredRow[],
  summaries: ModelSummary[],
): Promise<{ mdPath: string; csvPath: string; jsonlPath: string }> {
  const dir = join(ROOT, "reports", "runs");
  await mkdir(dir, { recursive: true });

  const jsonlPath = join(dir, `${runId}.jsonl`);
  await writeFile(jsonlPath, rows.map((r) => JSON.stringify(r)).join("\n"));

  const csvPath = join(dir, `${runId}.csv`);
  const csvHeader = [
    "query_id",
    "category",
    "model",
    "first_tool",
    "tool_correct",
    "tool_in_any_of",
    "param_score",
    "latency_ms",
    "input_tokens",
    "output_tokens",
    "cache_read_tokens",
    "cache_write_tokens",
    "cost_usd",
    "error",
    "justification",
  ].join(",");
  const csvBody = rows
    .map((r) =>
      [
        r.query_id,
        (r as unknown as { category?: string }).category ?? "",
        r.model,
        r.first_tool ?? "NONE",
        r.tool_correct,
        r.tool_in_any_of,
        r.param_score,
        r.latency_ms,
        r.input_tokens,
        r.output_tokens,
        r.cache_read_tokens,
        r.cache_write_tokens,
        r.cost_usd.toFixed(6),
        csvEscape(r.error ?? ""),
        csvEscape(r.justification),
      ].join(","),
    )
    .join("\n");
  await writeFile(csvPath, `${csvHeader}\n${csvBody}\n`);

  const mdPath = join(dir, `${runId}.md`);
  await writeFile(mdPath, renderMarkdown(runId, rows, summaries));

  return { mdPath, csvPath, jsonlPath };
}

function csvEscape(s: string): string {
  if (/[,"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function renderMarkdown(
  runId: string,
  rows: ScoredRow[],
  summaries: ModelSummary[],
): string {
  const headline = summaries
    .map(
      (s) =>
        `- **${s.model}**: ${s.tool_correct_pct.toFixed(1)}% first-try correct · any-of ${s.tool_in_any_of_pct.toFixed(1)}% · params ${s.avg_param_score.toFixed(2)}/5 · ${s.avg_latency_ms.toFixed(0)}ms avg · $${s.total_cost_usd.toFixed(4)} total · cache-hit ${(s.cache_hit_rate * 100).toFixed(1)}%`,
    )
    .join("\n");

  const byCatTable = renderCategoryTable(summaries);
  const failures = renderFailures(rows);

  return `# MCP Tool Selection Eval — ${runId}

**Question:** Given N tools across M MCP servers, does the model pick the right one first try?

**Setup:** ${rows.length} rows · ${summaries.length} models · ${new Set(rows.map((r) => r.query_id)).size} unique queries · judge = Claude Opus 4.7

## Headline

${headline}

## By category

${byCatTable}

## First-try failures (most informative)

${failures}

---

*Reports: \`reports/runs/${runId}.jsonl\` (raw) · \`reports/runs/${runId}.csv\` (spreadsheet)*
`;
}

function renderCategoryTable(summaries: ModelSummary[]): string {
  const cats = new Set<string>();
  for (const s of summaries)
    for (const c of Object.keys(s.by_category)) cats.add(c);
  const catList = [...cats].sort();

  const header =
    `| Category | ` + summaries.map((s) => s.model).join(" | ") + " |";
  const sep = `|---|` + summaries.map(() => "---").join("|") + "|";
  const rows = catList.map((c) => {
    const cells = summaries.map((s) => {
      const v = s.by_category[c];
      if (!v) return "—";
      return `${v.tool_correct_pct.toFixed(0)}% · ${v.avg_param_score.toFixed(1)}/5`;
    });
    return `| ${c} | ` + cells.join(" | ") + " |";
  });

  return [header, sep, ...rows].join("\n");
}

function renderFailures(rows: ScoredRow[]): string {
  const failed = rows.filter((r) => !r.tool_in_any_of).slice(0, 20);
  if (failed.length === 0)
    return "_No failures — every row picked an acceptable tool._";
  return failed
    .map(
      (r) =>
        `- \`${r.query_id}\` (${r.model}) → chose \`${r.first_tool ?? "NONE"}\`. ${r.justification}`,
    )
    .join("\n");
}
