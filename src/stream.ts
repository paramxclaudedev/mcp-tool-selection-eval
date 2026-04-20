import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { CaseResult } from "./runner.js";
import { isSensible } from "./report.js";

export type StreamStatus = "queued" | "running" | "done" | "error";

export type StreamEvent = {
  ts: string;
  run_id: string;
  branch_id?: string;
  model: string;
  provider: string;
  tier: string;
  case_id: string;
  category?: string;
  status: StreamStatus;
  score?: { correct: boolean; sensible: boolean } | null;
  picked_tool?: string | null;
  latency_ms?: number;
  error?: string;
};

export class Stream {
  private logPath: string;
  private runId: string;
  private branchId?: string;

  constructor(logPath: string, runId: string, branchId?: string) {
    this.logPath = logPath;
    this.runId = runId;
    this.branchId = branchId;
    mkdirSync(dirname(logPath), { recursive: true });
  }

  emit(partial: Omit<StreamEvent, "ts" | "run_id" | "branch_id">): void {
    const ev: StreamEvent = {
      ts: new Date().toISOString(),
      run_id: this.runId,
      branch_id: this.branchId,
      ...partial,
    };
    const line = JSON.stringify(ev);
    process.stdout.write(line + "\n");
    try {
      appendFileSync(this.logPath, line + "\n");
    } catch {
      // log file write should never kill the run
    }
  }

  queued(params: {
    model: string;
    provider: string;
    tier: string;
    case_id: string;
    category?: string;
  }): void {
    this.emit({ ...params, status: "queued" });
  }

  running(params: {
    model: string;
    provider: string;
    tier: string;
    case_id: string;
  }): void {
    this.emit({ ...params, status: "running" });
  }

  done(result: CaseResult): void {
    this.emit({
      model: result.model,
      provider: result.provider,
      tier: result.tier,
      case_id: result.case_id,
      category: result.category,
      status: "done",
      picked_tool: result.picked_tool,
      latency_ms: result.latency_ms,
      score: {
        correct: result.correct,
        sensible: isSensible(result),
      },
    });
  }

  error(result: CaseResult): void {
    this.emit({
      model: result.model,
      provider: result.provider,
      tier: result.tier,
      case_id: result.case_id,
      status: "error",
      error: result.error ?? "unknown",
      latency_ms: result.latency_ms,
    });
  }
}
