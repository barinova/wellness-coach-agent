import { run } from "@openai/agents";
import { createHealthCoach } from "../agents/healthCoach";
import { createSafetyReviewer } from "../agents/safetyReviewer";
import { savePlanMarkdown } from "../skills/plans";
import { createSavePlanGate } from "../skills/saveGate";
import {
  collectToolCalls,
  hasTool,
  type ToolCallInfo,
} from "./collectToolCalls";
import { ensureCursorOpenAIClient } from "./cursorOpenAI";
import { activePromptVersions } from "./promptVersions";
import { REQUIRED_TOOLS } from "./requiredTools";
import { appendRound, emptyRounds, type RoundState } from "./rounds";
import { finalScore, improved } from "./score";
import { getAgentModel } from "./agentModel";
import { traceRun } from "./traceRun";
import { reviewPlan, type Review } from "./validateReview";

export type { Review, RoundState, ToolCallInfo };

export type HealthAgentResult = {
  plan: string;
  review: Review;
  rounds: RoundState[];
  finalScore: number | null;
  improved: boolean;
  promptVersions: { coach: string; reviewer: string };
  durationMs: number;
  /** Flattened tool calls across all rounds (same order as execution). */
  toolCalls: ToolCallInfo[];
};

const DEFAULT_MAX_ROUNDS = 3;

const textOf = (r: { finalOutput?: unknown }) => String(r.finalOutput ?? "").trim();

const MEDICAL_ISSUE = "Request is about medication, diagnosis, or treatment — outside wellness coaching";

function buildResult(
  plan: string,
  review: Review,
  rounds: RoundState[],
  startedAt: number,
  toolCalls: ToolCallInfo[],
): HealthAgentResult {
  return {
    plan,
    review,
    rounds,
    finalScore: finalScore(rounds),
    improved: improved(rounds),
    promptVersions: activePromptVersions(),
    durationMs: Date.now() - startedAt,
    toolCalls,
  };
}

/** Build result, persist a local JSON trace (best-effort), return the same result. */
function finish(task: string, result: HealthAgentResult): HealthAgentResult {
  traceRun({
    task,
    promptVersions: result.promptVersions,
    rounds: result.rounds,
    toolCalls: result.toolCalls,
    finalScore: result.finalScore,
    verdict: result.review.verdict,
    durationMs: result.durationMs,
    model: getAgentModel(),
  });
  return result;
}

export async function runHealthAgent(
  task: string,
  maxRounds = DEFAULT_MAX_ROUNDS,
): Promise<HealthAgentResult> {
  const startedAt = Date.now();
  ensureCursorOpenAIClient();

  if (
    /tablet|pill|medication|medicine|drug|diagnos|treatment|dosage|antibiotic|prescription|таблетк|лекарств|препарат|диагноз\b|лечени[еюя]|дозировк|антибиот|рецепт/i.test(
      task,
    )
  ) {
    const review: Review = {
      verdict: "needs_human_professional",
      score: 0,
      issues: [MEDICAL_ISSUE],
    };
    const rounds = appendRound(emptyRounds(), 1, "", review, []);
    console.log(`Round 1: verdict=${review.verdict}, score=${review.score}, issues=${JSON.stringify(review.issues)}`);
    console.log("This request needs a specialist. Stopping.");
    return finish(task, buildResult("", review, rounds, startedAt, []));
  }

  // Run-scoped gate: only harness opens save after approve (prompts are soft).
  const saveGate = createSavePlanGate();
  const coach = createHealthCoach(saveGate);
  const reviewer = createSafetyReviewer();
  const toolCalls: ToolCallInfo[] = [];

  const taskBlock = `Task:\n${task}`;
  let plan = "";
  let notes = "";
  let review: Review | undefined;
  let rounds = emptyRounds();

  const runReviewer = async (prompt: string) => textOf(await run(reviewer, prompt));

  for (let round = 1; round <= maxRounds; round++) {
    const roundTools: ToolCallInfo[] = [];
    const take = (calls: ToolCallInfo[]) => {
      roundTools.push(...calls);
      toolCalls.push(...calls);
    };

    const coachPrompt = notes
      ? `${taskBlock}\n\nReviewer notes:\n${notes}\n\nRevise the previous plan:\n${plan}`
      : taskBlock;
    const coachResult = await run(coach, coachPrompt);
    take(collectToolCalls(coachResult));
    plan = textOf(coachResult);

    // Prompts + Cursor text bridge are soft. One combined nudge, then harness fallback.
    // Check against this round + earlier rounds so we do not re-fetch every revise.
    const missing = REQUIRED_TOOLS.filter((t) => t.needed(task) && !hasTool(toolCalls, t.name));
    if (missing.length > 0) {
      const ask = missing.map((t) => `- ${t.name}: ${t.ask}`).join("\n");
      const nudge = await run(
        coach,
        `${taskBlock}\n\nDraft:\n${plan}\n\nCall these tools now (tool_calls JSON), then revise:\n${ask}`,
      );
      take(collectToolCalls(nudge));
      const nudged = textOf(nudge);
      if (nudged) plan = nudged;
    }
    const stillMissing = REQUIRED_TOOLS.filter((t) => t.needed(task) && !hasTool(toolCalls, t.name));
    if (stillMissing.length > 0) {
      const blocks = stillMissing.map((t) => {
        const { body, call } = t.fallback(task, plan);
        take([call]);
        return `### ${t.name}\n${body}`;
      });
      const patched = await run(
        coach,
        `${taskBlock}\n\nDraft:\n${plan}\n\nTool results (already fetched — do not skip them):\n${blocks.join("\n\n")}\n\nRewrite the reply using these results. Plain markdown only; no tool JSON.`,
      );
      take(collectToolCalls(patched));
      const next = textOf(patched);
      if (next) plan = next;
    }

    const revisionContext = notes
      ? `Review round: ${round} of ${maxRounds}. This is a revised plan. Previous issues the coach was asked to fix:\n${notes}`
      : `Review round: ${round} of ${maxRounds}. This is the first coach draft.`;
    review = await reviewPlan(
      runReviewer,
      `${taskBlock}\n\n${revisionContext}\n\nCoach plan:\n${plan}`,
    );

    if (review.verdict === "approve") {
      // Harness owns persistence: do not trust the model to call savePlan only after approve.
      saveGate.allowSavePlan = true;
      savePlanMarkdown(plan);
      take([{ name: "savePlan" }]);
    }

    rounds = appendRound(rounds, round, plan, review, roundTools);
    console.log(`Round ${round}: verdict=${review.verdict}, score=${review.score}, issues=${JSON.stringify(review.issues)}`);

    if (review.verdict === "needs_human_professional") {
      console.log("This request needs a specialist. Stopping.");
      return finish(task, buildResult(plan, review, rounds, startedAt, toolCalls));
    }
    if (review.verdict === "approve") {
      console.log(`Plan saved to output.md. score=${review.score}`);
      return finish(task, buildResult(plan, review, rounds, startedAt, toolCalls));
    }
    notes = review.issues.join("\n");
  }

  console.log(`Plan was not approved in ${maxRounds} rounds. output.md was not updated.`);
  return finish(task, buildResult(plan, review!, rounds, startedAt, toolCalls));
}
