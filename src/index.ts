#!/usr/bin/env node
import "dotenv/config";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { CASES, type Tier } from "./cases.js";
import { MODELS, runAll, type ModelSpec } from "./runner.js";
import { printReport, toJSON } from "./report.js";

type Args = {
  smoke: boolean;
  specs: ModelSpec[];
  tiers: Tier[];
  concurrency: number;
  out: string;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    smoke: false,
    specs: [...MODELS],
    tiers: ["small", "medium", "large"],
    concurrency: 4,
    out: resolve("results", `run-${Date.now()}.json`),
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cases = args.smoke ? CASES.slice(0, 5) : CASES;
  const tiers = args.smoke ? (["small"] as Tier[]) : args.tiers;
  const specs = args.smoke ? args.specs.slice(0, 1) : args.specs;

  checkKeys(specs);

  console.log(
    `running ${cases.length} cases × ${tiers.length} tiers × ${specs.length} models`,
  );
  console.log(`models: ${specs.map((s) => s.label).join(", ")}`);

  const results = await runAll({
    specs,
    tiers,
    cases,
    concurrency: args.concurrency,
  });

  mkdirSync(dirname(args.out), { recursive: true });
  const payload = toJSON(results);
  writeFileSync(args.out, JSON.stringify(payload, null, 2));
  console.log(`\nwrote ${args.out}`);

  printReport(results);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
