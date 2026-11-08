import { run } from "@openai/agents";
import { createHealthCoach } from "../agents/healthCoach";
import { reviewer } from "../agents/safetyReviewer";
import { savePlanMarkdown } from "../skills/plans";
import { createSavePlanGate } from "../skills/saveGate";
import { collectToolCalls } from "./collectToolCalls";
import { ensureCursorOpenAIClient } from "./cursorOpenAI";
import { activePromptVersions } from "./promptVersions";
import { appendRound, emptyRounds, type RoundState } from "./rounds";
import { finalScore, improved } from "./score";
import { reviewPlan, type Review } from "./validateReview";

export type { Review, RoundState };

export type HealthAgentResult = {
  plan: string;
  review: Review;
  rounds: RoundState[];
  finalScore: number | null;
  improved: boolean;
  promptVersions: { coach: string; reviewer: string };
  durationMs: number;
  toolCalls: string[];
};

const DEFAULT_MAX_ROUNDS = 3;

const textOf = (r: { finalOutput?: unknown }) => String(r.finalOutput ?? "").trim();

const MEDICAL_ISSUE = "Request is about medication, diagnosis, or treatment — outside wellness coaching";

function buildResult(
  plan: string,
  review: Review,
  rounds: RoundState[],
  startedAt: number,
  toolCalls: string[],
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
    const rounds = appendRound(emptyRounds(), 1, "", review);
    console.log(`Round 1: verdict=${review.verdict}, score=${review.score}, issues=${JSON.stringify(review.issues)}`);
    console.log("This request needs a specialist. Stopping.");
    return buildResult("", review, rounds, startedAt, []);
  }

  // Run-scoped gate: only harness opens save after approve (prompts are soft).
  const saveGate = createSavePlanGate();
  const coach = createHealthCoach(saveGate);
  const toolCalls: string[] = [];

  const taskBlock = `Task:\n${task}`;
  let plan = "";
  let notes = "";
  let review: Review | undefined;
  let rounds = emptyRounds();

  const runReviewer = async (prompt: string) => textOf(await run(reviewer, prompt));

  for (let round = 1; round <= maxRounds; round++) {
    const coachPrompt = notes
      ? `${taskBlock}\n\nReviewer notes:\n${notes}\n\nRevise the previous plan:\n${plan}`
      : taskBlock;
    const coachResult = await run(coach, coachPrompt);
    toolCalls.push(...collectToolCalls(coachResult));
    plan = textOf(coachResult);

    const revisionContext = notes
      ? `Review round: ${round} of ${maxRounds}. This is a revised plan. Previous issues the coach was asked to fix:\n${notes}`
      : `Review round: ${round} of ${maxRounds}. This is the first coach draft.`;
    review = await reviewPlan(
      runReviewer,
      `${taskBlock}\n\n${revisionContext}\n\nCoach plan:\n${plan}`,
    );
    rounds = appendRound(rounds, round, plan, review);
    console.log(`Round ${round}: verdict=${review.verdict}, score=${review.score}, issues=${JSON.stringify(review.issues)}`);

    if (review.verdict === "needs_human_professional") {
      console.log("This request needs a specialist. Stopping.");
      return buildResult(plan, review, rounds, startedAt, toolCalls);
    }
    if (review.verdict === "approve") {
      // Harness owns persistence: do not trust the model to call savePlan only after approve.
      saveGate.allowSavePlan = true;
      savePlanMarkdown(plan);
      toolCalls.push("savePlan");
      console.log(`Plan saved to output.md. score=${review.score}`);
      return buildResult(plan, review, rounds, startedAt, toolCalls);
    }
    notes = review.issues.join("\n");
  }

  console.log(`Plan was not approved in ${maxRounds} rounds. output.md was not updated.`);
  return buildResult(plan, review!, rounds, startedAt, toolCalls);
}
