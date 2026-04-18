#!/usr/bin/env node
import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { CASES, type Tier } from "./cases.js";
import { MODELS, runAll, type ModelId } from "./runner.js";
import { printReport, toJSON } from "./report.js";

type Args = {
  smoke: boolean;
  models: ModelId[];
  tiers: Tier[];
  concurrency: number;
  out: string;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    smoke: false,
    models: [...MODELS],
    tiers: ["small", "medium", "large"],
    concurrency: 4,
    out: resolve("results", `run-${Date.now()}.json`),
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--smoke") args.smoke = true;
    else if (a === "--models") {
      args.models = argv[++i]!.split(",") as ModelId[];
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

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Missing ANTHROPIC_API_KEY in env.");
    process.exit(1);
  }

  const client = new Anthropic();
  const cases = args.smoke ? CASES.slice(0, 5) : CASES;
  const tiers = args.smoke ? (["small"] as Tier[]) : args.tiers;
  const models = args.smoke ? ([MODELS[2]!] as ModelId[]) : args.models;

  console.log(
    `running ${cases.length} cases × ${tiers.length} tiers × ${models.length} models = ${
      cases.length * tiers.length * models.length
    } calls`,
  );

  const results = await runAll({
    client,
    models,
    tiers,
    cases,
    concurrency: args.concurrency,
  });

  const payload = toJSON(results);
  writeFileSync(args.out, JSON.stringify(payload, null, 2));
  console.log(`\nwrote ${args.out}`);

  printReport(results);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
