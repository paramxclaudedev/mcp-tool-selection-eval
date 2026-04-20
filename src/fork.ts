import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readdirSync,
} from "node:fs";
import { resolve, dirname, join } from "node:path";
import { runAll, MODELS, type CaseResult, type ModelSpec } from "./runner.js";
import { CASES, SERVER_TIERS, type Tier } from "./cases.js";
import {
  isSensible,
  scoreboard,
  modelCategoryMatrix,
  modelTierMatrix,
  toJSON,
  type Scoreboard,
} from "./report.js";
import { Stream } from "./stream.js";

export type BoostKind = "disambiguation" | "strict-refusal" | "none";

export type ForkOptions = {
  basePath: string;
  branchId: string;
  category?: string;
  tiers?: Tier[];
  providers?: string[];
  models?: string[];
  boost: BoostKind;
  rescoreOnly: boolean;
  outRoot: string;
  concurrency: number;
};

type BaseRun = {
  generated_at: string;
  results: CaseResult[];
  run_id?: string;
};

export function loadBaseRun(basePath: string): {
  payload: BaseRun;
  runId: string;
  runDir: string;
} {
  const abs = resolve(basePath);
  const raw = readFileSync(abs, "utf8");
  const payload = JSON.parse(raw) as BaseRun;
  const runDir = dirname(abs);
  const runId = payload.run_id ?? inferRunId(abs);
  return { payload, runId, runDir };
}

function inferRunId(path: string): string {
  const base = path.split("/").pop() ?? "run";
  return base.replace(/\.json$/, "");
}

/**
 * Disambiguation boost — for cases in category=ambiguous:
 *  - bonus_sensible: any picked_tool that shares a server with ANY accepted
 *    tool counts as sensible (looser than base sensible). Measures "did it at
 *    least land in a reasonable neighbourhood?"
 *  - strict-refusal: picked=<none> is scored as wrong for non-refusal
 *    categories. Models that bail lose credit.
 */
export function boostScore(
  r: CaseResult,
  boost: BoostKind,
): {
  correct: boolean;
  sensible: boolean;
} {
  const baseSensible = isSensible(r);
  if (boost === "none") {
    return { correct: r.correct, sensible: baseSensible };
  }
  if (boost === "disambiguation" && r.category === "ambiguous") {
    if (r.correct) return { correct: true, sensible: true };
    if (baseSensible) return { correct: r.correct, sensible: true };
    if (!r.picked_tool) return { correct: false, sensible: false };
    const pickedServer = r.picked_tool.split("_")[0] ?? "";
    const neighbour = r.correct_tools.some(
      (t) => (t.split("_")[0] ?? "") === pickedServer,
    );
    return { correct: r.correct, sensible: neighbour };
  }
  if (boost === "strict-refusal") {
    if (!r.picked_tool) return { correct: false, sensible: false };
    return { correct: r.correct, sensible: baseSensible };
  }
  return { correct: r.correct, sensible: baseSensible };
}

function rescore(results: CaseResult[], boost: BoostKind): Scoreboard {
  const total = results.length;
  const enriched = results.map((r) => boostScore(r, boost));
  const correct = enriched.filter((e) => e.correct).length;
  const sensible = enriched.filter((e) => e.sensible).length;
  const errors = results.filter((r) => r.error).length;
  return {
    total,
    correct,
    accuracy: total === 0 ? 0 : correct / total,
    sensible,
    sensible_accuracy: total === 0 ? 0 : sensible / total,
    errors,
  };
}

export function buildComparison(
  base: CaseResult[],
  fork: CaseResult[],
  boost: BoostKind,
): string {
  const lines: string[] = [];
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  const baseByModel = group(base, (r) => r.model);
  const forkByModel = group(fork, (r) => r.model);
  lines.push("## base vs. fork — overall");
  lines.push(
    "| model | base strict | fork strict | Δ strict | base sensible | fork sensible | Δ sensible |",
  );
  lines.push("|---|---:|---:|---:|---:|---:|---:|");
  const allModels = new Set([
    ...Object.keys(baseByModel),
    ...Object.keys(forkByModel),
  ]);
  for (const m of Array.from(allModels).sort()) {
    const b = rescore(baseByModel[m] ?? [], "none");
    const f = rescore(forkByModel[m] ?? [], boost);
    lines.push(
      `| ${m} | ${pct(b.accuracy)} | ${pct(f.accuracy)} | ${diffPct(b.accuracy, f.accuracy)} | ` +
        `${pct(b.sensible_accuracy)} | ${pct(f.sensible_accuracy)} | ${diffPct(b.sensible_accuracy, f.sensible_accuracy)} |`,
    );
  }
  return lines.join("\n");
}

function diffPct(a: number, b: number): string {
  const d = (b - a) * 100;
  const sign = d > 0 ? "+" : "";
  return `${sign}${d.toFixed(1)}pp`;
}

function group<T, K extends string>(
  arr: T[],
  keyFn: (t: T) => K,
): Record<K, T[]> {
  const out = {} as Record<K, T[]>;
  for (const x of arr) {
    const k = keyFn(x);
    (out[k] ||= []).push(x);
  }
  return out;
}

function pickSpecs(providers?: string[], models?: string[]): ModelSpec[] {
  let specs: ModelSpec[] = [...MODELS];
  if (providers && providers.length > 0) {
    specs = specs.filter((s) => providers.includes(s.provider));
  }
  if (models && models.length > 0) {
    specs = specs.filter((s) => models.includes(s.id));
  }
  return specs;
}

export async function runFork(opts: ForkOptions): Promise<{
  branchDir: string;
  comparisonPath: string;
  summary: string;
}> {
  const { payload, runId, runDir } = loadBaseRun(opts.basePath);
  const branchDir = join(
    resolve(opts.outRoot),
    "runs",
    runId,
    "branches",
    opts.branchId,
  );
  mkdirSync(branchDir, { recursive: true });

  // Filter base results to build the case subset
  let baseSubset = payload.results.filter((r) => !r.error);
  if (opts.category) {
    baseSubset = baseSubset.filter((r) => r.category === opts.category);
  }
  if (opts.tiers && opts.tiers.length > 0) {
    baseSubset = baseSubset.filter((r) =>
      (opts.tiers as string[]).includes(r.tier),
    );
  }
  const specs = pickSpecs(opts.providers, opts.models);
  if (specs.length > 0) {
    const ids = new Set(specs.map((s) => s.id));
    baseSubset = baseSubset.filter((r) => ids.has(r.model));
  }

  let forkResults: CaseResult[];
  if (opts.rescoreOnly) {
    forkResults = baseSubset;
  } else {
    // Re-run the cases in baseSubset
    const streamPath = join(branchDir, "stream.log");
    const stream = new Stream(streamPath, runId, opts.branchId);
    const caseIds = new Set(baseSubset.map((r) => r.case_id));
    const tiers = Array.from(new Set(baseSubset.map((r) => r.tier))) as Tier[];
    const filteredSpecs = specs.length
      ? specs
      : MODELS.filter((m) => baseSubset.some((r) => r.model === m.id));
    const cases = CASES.filter((c) => caseIds.has(c.id));
    forkResults = await runAll({
      specs: filteredSpecs,
      tiers: tiers.length > 0 ? tiers : (Object.keys(SERVER_TIERS) as Tier[]),
      cases,
      concurrency: opts.concurrency,
      stream,
    });
  }

  // Persist full fork results
  writeFileSync(
    join(branchDir, "results.json"),
    JSON.stringify(
      {
        ...toJSON(forkResults),
        run_id: runId,
        branch_id: opts.branchId,
        boost: opts.boost,
      },
      null,
      2,
    ),
  );

  // Persist metadata
  writeFileSync(
    join(branchDir, "branch.json"),
    JSON.stringify(
      {
        run_id: runId,
        branch_id: opts.branchId,
        parent: opts.basePath,
        category: opts.category ?? null,
        tiers: opts.tiers ?? null,
        providers: opts.providers ?? null,
        models: opts.models ?? null,
        boost: opts.boost,
        rescore_only: opts.rescoreOnly,
        created_at: new Date().toISOString(),
      },
      null,
      2,
    ),
  );

  // Build comparison — align base subset for fair comparison
  const baseForCompare = payload.results.filter((r) => {
    if (r.error) return false;
    if (opts.category && r.category !== opts.category) return false;
    if (
      opts.tiers &&
      opts.tiers.length > 0 &&
      !opts.tiers.includes(r.tier as Tier)
    )
      return false;
    if (specs.length > 0) {
      const ids = new Set(specs.map((s) => s.id));
      if (!ids.has(r.model)) return false;
    }
    return true;
  });
  const comparison = buildComparison(baseForCompare, forkResults, opts.boost);
  const report = [
    `# fork: ${opts.branchId}`,
    ``,
    `- base run: \`${opts.basePath}\``,
    `- category: ${opts.category ?? "(all)"}`,
    `- tiers: ${opts.tiers?.join(",") ?? "(all)"}`,
    `- providers: ${opts.providers?.join(",") ?? "(all)"}`,
    `- boost: \`${opts.boost}\``,
    `- rescore-only: ${opts.rescoreOnly}`,
    ``,
    comparison,
    ``,
  ].join("\n");
  const comparisonPath = join(branchDir, "comparison.md");
  writeFileSync(comparisonPath, report);

  return {
    branchDir,
    comparisonPath,
    summary: report,
  };
}

export function listBranches(runId: string, outRoot: string): string[] {
  const branchesDir = join(resolve(outRoot), "runs", runId, "branches");
  if (!existsSync(branchesDir)) return [];
  return readdirSync(branchesDir).filter((f) =>
    existsSync(join(branchesDir, f, "branch.json")),
  );
}
