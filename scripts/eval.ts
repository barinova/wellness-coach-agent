import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runHealthAgent } from "../src/harness/runHealthAgent";

type ExpectVerdict = "approve" | "needs_human_professional";

type EvalCase = {
  name: string;
  task: string;
  expect: {
    verdict: ExpectVerdict;
    minScore?: number;
  };
};

type Loaded =
  | { ok: true; case: EvalCase }
  | { ok: false; name: string; error: string };

type Row = { name: string; pass: boolean; detail: string };

const CASES_DIR = "evals/cases";

function loadCases(): Loaded[] {
  let files: string[];
  try {
    files = readdirSync(CASES_DIR)
      .filter((f) => f.endsWith(".json"))
      .sort();
  } catch {
    console.error(`Cannot read ${CASES_DIR}`);
    process.exit(1);
  }

  return files.map((file) => {
    const path = join(CASES_DIR, file);
    const fallbackName = file.replace(/\.json$/, "");
    try {
      const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<EvalCase>;
      if (!raw?.name || typeof raw.task !== "string" || !raw.expect?.verdict) {
        return { ok: false, name: fallbackName, error: "missing name, task, or expect.verdict" };
      }
      if (raw.expect.verdict !== "approve" && raw.expect.verdict !== "needs_human_professional") {
        return { ok: false, name: fallbackName, error: "invalid expect.verdict" };
      }
      return {
        ok: true,
        case: {
          name: raw.name,
          task: raw.task,
          expect: {
            verdict: raw.expect.verdict,
            minScore: raw.expect.minScore,
          },
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, name: fallbackName, error: message };
    }
  });
}

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : `${s}${" ".repeat(n - s.length)}`;
}

async function main() {
  const loaded = loadCases();
  const rows: Row[] = [];

  for (const item of loaded) {
    if (!item.ok) {
      rows.push({ name: item.name, pass: false, detail: item.error });
      continue;
    }
    const c = item.case;
    if (!c.task.trim()) {
      rows.push({ name: c.name, pass: false, detail: "empty task" });
      continue;
    }

    try {
      const result = await runHealthAgent(c.task);
      const verdictOk = result.review.verdict === c.expect.verdict;
      const scoreOk =
        c.expect.minScore == null ||
        (result.finalScore != null && result.finalScore >= c.expect.minScore);
      const pass = verdictOk && scoreOk;
      const detail = pass
        ? `verdict=${result.review.verdict} score=${result.finalScore}`
        : `got verdict=${result.review.verdict} score=${result.finalScore}; want ${c.expect.verdict}` +
          (c.expect.minScore != null ? ` minScore>=${c.expect.minScore}` : "");
      rows.push({ name: c.name, pass, detail });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      rows.push({ name: c.name, pass: false, detail: message });
    }
  }

  console.log("");
  console.log(`${pad("CASE", 24)} ${pad("RESULT", 6)} DETAIL`);
  console.log("─".repeat(72));
  for (const row of rows) {
    console.log(`${pad(row.name, 24)} ${pad(row.pass ? "PASS" : "FAIL", 6)} ${row.detail}`);
  }
  const failed = rows.filter((r) => !r.pass).length;
  console.log("─".repeat(72));
  console.log(`${rows.length - failed}/${rows.length} passed`);

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
