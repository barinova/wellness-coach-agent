import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentModel } from "./agentModel";
import type { ToolCallInfo } from "./collectToolCalls";
import type { RoundState } from "./rounds";
import type { Review } from "./validateReview";

const RUNS_DIR = "runs";
const PLAN_EXCERPT_LEN = 500;

export type TraceRound = {
  round: number;
  planExcerpt: string;
  review: Review;
};

export type TraceRun = {
  runId: string;
  task: string;
  promptVersions: { coach: string; reviewer: string };
  model: string;
  rounds: TraceRound[];
  toolCalls: ToolCallInfo[];
  finalScore: number | null;
  verdict: Review["verdict"];
  durationMs: number;
  createdAt: string;
};

export type TraceRunInput = {
  task: string;
  promptVersions: { coach: string; reviewer: string };
  rounds: RoundState[];
  toolCalls: ToolCallInfo[];
  finalScore: number | null;
  verdict: Review["verdict"];
  durationMs: number;
  model?: string;
};

function excerpt(plan: string): string {
  return plan.length <= PLAN_EXCERPT_LEN ? plan : plan.slice(0, PLAN_EXCERPT_LEN);
}

function fileSafeTimestamp(iso: string): string {
  return iso.replace(/[:.]/g, "-");
}

/** Persist a run under `runs/`. Returns the file path, or null on failure (never throws). */
export function traceRun(input: TraceRunInput): string | null {
  try {
    const createdAt = new Date().toISOString();
    const runId = `run-${fileSafeTimestamp(createdAt)}`;
    const trace: TraceRun = {
      runId,
      task: input.task,
      promptVersions: input.promptVersions,
      model: input.model ?? getAgentModel(),
      rounds: input.rounds.map((r) => ({
        round: r.round,
        planExcerpt: excerpt(r.plan),
        review: r.review,
      })),
      toolCalls: input.toolCalls,
      finalScore: input.finalScore,
      verdict: input.verdict,
      durationMs: input.durationMs,
      createdAt,
    };

    mkdirSync(RUNS_DIR, { recursive: true });
    const path = join(RUNS_DIR, `${runId}.json`);
    writeFileSync(path, `${JSON.stringify(trace, null, 2)}\n`, "utf8");
    return path;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`traceRun failed: ${message}`);
    return null;
  }
}
