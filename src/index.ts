#!/usr/bin/env node
import "dotenv/config";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { CASES, type Tier } from "./cases.js";
import { MODELS, runAll, type ModelSpec } from "./runner.js";
import { printReport, toJSON } from "./report.js";
import { Stream } from "./stream.js";
import { runFork, type BoostKind } from "./fork.js";

type RunArgs = {
  smoke: boolean;
  specs: ModelSpec[];
  tiers: Tier[];
  concurrency: number;
  out: string;
  runId: string;
  stream: boolean;
  runRoot: string;
};

function newRunId(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`
  );
}

function parseRunArgs(argv: string[]): RunArgs {
  const runId = newRunId();
  const runRootDefault = resolve("results");
  const runDir = join(runRootDefault, "runs", runId);
  const args: RunArgs = {
    smoke: false,
    specs: [...MODELS],
    tiers: ["small", "medium", "large"],
    concurrency: 4,
    out: join(runDir, "results.json"),
    runId,
    stream: true,
    runRoot: runRootDefault,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--smoke") args.smoke = true;
    else if (a === "--models") {
      const ids = argv[++i]!.split(",");
      args.specs = MODELS.filter((m) => ids.includes(m.id));
    } else if (a === "--providers") {
      const provs = argv[++i]!.split(",");
      args.specs = MODELS.filter((m) => provs.includes(m.provider));
    } else if (a === "--tiers") {
      args.tiers = argv[++i]!.split(",") as Tier[];
    } else if (a === "--concurrency") {
      args.concurrency = Number(argv[++i]);
    } else if (a === "--out") {
      args.out = resolve(argv[++i]!);
    } else if (a === "--run-id") {
      args.runId = argv[++i]!;
      args.out = join(args.runRoot, "runs", args.runId, "results.json");
    } else if (a === "--run-root") {
      args.runRoot = resolve(argv[++i]!);
      args.out = join(args.runRoot, "runs", args.runId, "results.json");
    } else if (a === "--no-stream") {
      args.stream = false;
    }
  }
  return args;
}

function checkKeys(specs: ModelSpec[]): void {
  const need = new Set(specs.map((s) => s.provider));
  const missing: string[] = [];
  if (need.has("anthropic") && !process.env.ANTHROPIC_API_KEY)
    missing.push("ANTHROPIC_API_KEY");
  if (need.has("openai") && !process.env.OPENAI_API_KEY)
    missing.push("OPENAI_API_KEY");
  if (need.has("gemini") && !process.env.GEMINI_API_KEY)
    missing.push("GEMINI_API_KEY");
  if (missing.length) {
    console.error(`Missing env: ${missing.join(", ")}`);
    process.exit(1);
  }
}

async function cmdRun(rest: string[]): Promise<void> {
  const args = parseRunArgs(rest);
  const cases = args.smoke ? CASES.slice(0, 5) : CASES;
  const tiers = args.smoke ? (["small"] as Tier[]) : args.tiers;
  const specs = args.smoke ? args.specs.slice(0, 1) : args.specs;

  checkKeys(specs);

  const runDir = dirname(args.out);
  mkdirSync(runDir, { recursive: true });
  const streamPath = join(runDir, "stream.log");
  const stream = args.stream ? new Stream(streamPath, args.runId) : undefined;

  if (!stream) {
    console.log(
      `running ${cases.length} cases × ${tiers.length} tiers × ${specs.length} models`,
    );
    console.log(`models: ${specs.map((s) => s.label).join(", ")}`);
  } else {
    // Boot event so viewers know the run has started
    process.stdout.write(
      JSON.stringify({
        ts: new Date().toISOString(),
        run_id: args.runId,
        event: "run_start",
        n_cases: cases.length,
        n_tiers: tiers.length,
        n_models: specs.length,
        models: specs.map((s) => ({ id: s.id, label: s.label })),
        tiers,
      }) + "\n",
    );
  }

  const results = await runAll({
    specs,
    tiers,
    cases,
    concurrency: args.concurrency,
    stream,
  });

  const payload = { ...toJSON(results), run_id: args.runId };
  writeFileSync(args.out, JSON.stringify(payload, null, 2));
  if (!stream) {
    console.log(`\nwrote ${args.out}`);
    printReport(results);
  } else {
    process.stdout.write(
      JSON.stringify({
        ts: new Date().toISOString(),
        run_id: args.runId,
        event: "run_end",
        out: args.out,
      }) + "\n",
    );
  }
}

type ForkArgs = {
  base: string;
  branch: string;
  category?: string;
  tiers?: Tier[];
  providers?: string[];
  models?: string[];
  boost: BoostKind;
  rescoreOnly: boolean;
  outRoot: string;
  concurrency: number;
};

function parseForkArgs(argv: string[]): ForkArgs {
  const out: ForkArgs = {
    base: "",
    branch: `branch-${Date.now()}`,
    boost: "disambiguation",
    rescoreOnly: false,
    outRoot: resolve("results"),
    concurrency: 4,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--base") out.base = resolve(argv[++i]!);
    else if (a === "--branch") out.branch = argv[++i]!;
    else if (a === "--category") out.category = argv[++i]!;
    else if (a === "--tiers") out.tiers = argv[++i]!.split(",") as Tier[];
    else if (a === "--providers") out.providers = argv[++i]!.split(",");
    else if (a === "--models") out.models = argv[++i]!.split(",");
    else if (a === "--boost") out.boost = argv[++i]! as BoostKind;
    else if (a === "--rescore") out.rescoreOnly = true;
    else if (a === "--out-root") out.outRoot = resolve(argv[++i]!);
    else if (a === "--concurrency") out.concurrency = Number(argv[++i]);
  }
  if (!out.base) {
    console.error(
      "fork: --base <path/to/results.json> required (points at a base run's results.json)",
    );
    process.exit(1);
  }
  return out;
}

async function cmdFork(rest: string[]): Promise<void> {
  const args = parseForkArgs(rest);
  if (!args.rescoreOnly) {
    // Loading specs for key check — re-use MODELS
    const specs = MODELS.filter((m) =>
      args.models ? args.models.includes(m.id) : true,
    ).filter((m) =>
      args.providers ? args.providers.includes(m.provider) : true,
    );
    checkKeys(specs);
  }
  const { branchDir, comparisonPath, summary } = await runFork({
    basePath: args.base,
    branchId: args.branch,
    category: args.category,
    tiers: args.tiers,
    providers: args.providers,
    models: args.models,
    boost: args.boost,
    rescoreOnly: args.rescoreOnly,
    outRoot: args.outRoot,
    concurrency: args.concurrency,
  });
  process.stderr.write(`\nfork branch written to ${branchDir}\n`);
  process.stderr.write(`comparison: ${comparisonPath}\n\n`);
  process.stdout.write(summary + "\n");
}

function usage(): void {
  console.log(`usage:
  mcp-tool-selection-eval run [options]
  mcp-tool-selection-eval fork --base <results.json> --branch <id> [options]

run options:
  --smoke                 5 cases, 1 model, small tier only
  --models a,b            filter by model id
  --providers p,q         filter by provider (anthropic|openai|gemini)
  --tiers small,medium    subset of tiers
  --concurrency N         per-tier concurrency (default 4)
  --out <path>            override results.json path
  --run-id <id>           override run id (default: UTC timestamp)
  --run-root <dir>        override results root (default ./results)
  --no-stream             disable NDJSON streaming (old pretty log mode)

fork options:
  --base <path>           path to base run's results.json (required)
  --branch <id>           branch id (default: branch-<ts>)
  --category <name>       limit to one category (e.g. ambiguous)
  --tiers <list>          limit to tiers
  --providers <list>      limit to providers
  --models <list>         limit to model ids
  --boost <kind>          disambiguation | strict-refusal | none (default: disambiguation)
  --rescore               don't re-run; just re-score the base subset with the boost
  --out-root <dir>        results root (default ./results)
  --concurrency N         re-run concurrency (ignored with --rescore)
`);
}

async function main() {
  const argv = process.argv.slice(2);
  const sub = argv[0];
  // Back-compat: bare args (no subcommand) == run
  if (!sub || sub.startsWith("--")) {
    await cmdRun(argv);
    return;
  }
  if (sub === "run") {
    await cmdRun(argv.slice(1));
    return;
  }
  if (sub === "fork") {
    await cmdFork(argv.slice(1));
    return;
  }
  if (sub === "help" || sub === "--help" || sub === "-h") {
    usage();
    return;
  }
  console.error(`unknown subcommand: ${sub}`);
  usage();
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
