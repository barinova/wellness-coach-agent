import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runHealthAgent } from "../src/harness/runHealthAgent";
import type { TraceRun } from "../src/harness/traceRun";

function usage(): never {
  console.error("Usage: pnpm run replay -- <path-to-run.json>");
  process.exit(1);
}

function loadTrace(path: string): TraceRun {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    console.error(`Cannot read trace: ${path}`);
    process.exit(1);
  }
  try {
    return JSON.parse(raw) as TraceRun;
  } catch {
    console.error(`Invalid JSON: ${path}`);
    process.exit(1);
  }
}

function toolSummary(calls: { name: string; detail?: string }[]): string {
  if (calls.length === 0) return "(none)";
  return calls.map((c) => (c.detail ? `${c.name}(${c.detail})` : c.name)).join(", ");
}

function versions(v: { coach: string; reviewer: string }): string {
  return `coach=${v.coach}, reviewer=${v.reviewer}`;
}

async function main() {
  const arg = process.argv.slice(2).find((a) => a !== "--");
  if (!arg) usage();

  const path = resolve(arg);
  const old = loadTrace(path);
  if (typeof old.task !== "string" || !old.task.trim()) {
    console.error("Trace has no task string.");
    process.exit(1);
  }

  console.log(`Replaying task from ${path}`);
  console.log(`task: ${old.task.slice(0, 120)}${old.task.length > 120 ? "…" : ""}`);
  console.log("");

  const next = await runHealthAgent(old.task);

  const rows: Array<[string, string, string]> = [
    ["verdict", String(old.verdict), next.review.verdict],
    ["score", String(old.finalScore), String(next.finalScore)],
    ["rounds", String(old.rounds?.length ?? 0), String(next.rounds.length)],
    ["toolCalls", toolSummary(old.toolCalls ?? []), toolSummary(next.toolCalls)],
    ["promptVersions", versions(old.promptVersions), versions(next.promptVersions)],
  ];

  console.log("Comparison (old → new)");
  console.log("─".repeat(72));
  for (const [field, a, b] of rows) {
    const mark = a === b ? "=" : "≠";
    console.log(`${mark} ${field}`);
    console.log(`  old: ${a}`);
    console.log(`  new: ${b}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
