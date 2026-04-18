import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Query, ToolsFixture, ToolSchema } from "./types.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

export async function loadTools(): Promise<{
  fixture: ToolsFixture;
  flat: ToolSchema[];
}> {
  const raw = await readFile(join(ROOT, "fixtures/tools.json"), "utf8");
  const fixture = JSON.parse(raw) as ToolsFixture;
  const flat = fixture.servers.flatMap((s) => s.tools);
  return { fixture, flat };
}

export async function loadQueries(): Promise<Query[]> {
  const raw = await readFile(join(ROOT, "fixtures/queries.jsonl"), "utf8");
  return raw
    .trim()
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as Query);
}
