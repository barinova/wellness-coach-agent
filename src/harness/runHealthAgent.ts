import { readFileSync, writeFileSync } from "node:fs";
import { Agent as CursorAgent } from "@cursor/sdk";
import { run, setDefaultOpenAIClient, setOpenAIAPI, setTracingDisabled } from "@openai/agents";
import OpenAI from "openai";
import { coach } from "../agents/healthCoach";
import { reviewer } from "../agents/safetyReviewer";
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
};

function apiKeyFromEnvFile() {
  let raw = "";
  try {
    raw = readFileSync(".env", "utf8");
  } catch {
    throw new Error("Missing .env. Copy .env.example and set CURSOR_API_KEY.");
  }
  const line = raw.split(/\r?\n/).find((row) => /^\s*CURSOR_API_KEY\s*=/.test(row) && !row.trim().startsWith("#"));
  const value = line?.replace(/^\s*CURSOR_API_KEY\s*=\s*/, "").replace(/^["']|["']$/g, "").trim() ?? "";
  if (!value) throw new Error("CURSOR_API_KEY in .env is empty.");
  return value;
}

const MODEL = "composer-2.5";
const DEFAULT_MAX_ROUNDS = 3;

let clientReady = false;

function ensureClient() {
  if (clientReady) return;
  const apiKey = apiKeyFromEnvFile();
  setTracingDisabled(true);
  setOpenAIAPI("chat_completions");
  setDefaultOpenAIClient(
    new OpenAI({
      apiKey,
      baseURL: "http://127.0.0.1/v1",
      fetch: async (_url, init) => {
        const body = JSON.parse(String(init?.body ?? "{}"));
        const prompt = ((body.messages ?? []) as { role: string; content: unknown }[])
          .map((m) => `${m.role}: ${typeof m.content === "string" ? m.content : JSON.stringify(m.content)}`)
          .join("\n\n");
        const result = await CursorAgent.prompt(
          "Do not read or write files, do not run commands. Reply with text only.\n\n" + prompt,
          {
            apiKey,
            model: { id: MODEL, params: [{ id: "fast", value: "false" }] },
            local: { cwd: process.cwd(), settingSources: [] },
          },
        );
        if (result.status === "error") throw new Error(`Cursor run failed (${result.id})`);
        return new Response(
          JSON.stringify({
            id: result.id ?? "cursor",
            object: "chat.completion",
            choices: [{ index: 0, message: { role: "assistant", content: result.result ?? "" }, finish_reason: "stop" }],
            usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    }),
  );
  clientReady = true;
}

const textOf = (r: { finalOutput?: unknown }) => String(r.finalOutput ?? "").trim();

const MEDICAL_ISSUE = "Request is about medication, diagnosis, or treatment — outside wellness coaching";

function buildResult(
  plan: string,
  review: Review,
  rounds: RoundState[],
  startedAt: number,
): HealthAgentResult {
  return {
    plan,
    review,
    rounds,
    finalScore: finalScore(rounds),
    improved: improved(rounds),
    promptVersions: activePromptVersions(),
    durationMs: Date.now() - startedAt,
  };
}

export async function runHealthAgent(
  task: string,
  maxRounds = DEFAULT_MAX_ROUNDS,
): Promise<HealthAgentResult> {
  const startedAt = Date.now();
  ensureClient();

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
    return buildResult("", review, rounds, startedAt);
  }

  const profile = readFileSync("data/profile.md", "utf8");
  const log = readFileSync("data/log.md", "utf8");
  const context = `Task:\n${task}\n\nProfile:\n${profile}\n\nLog:\n${log}`;

  let plan = "";
  let notes = "";
  let review: Review | undefined;
  let rounds = emptyRounds();

  const runReviewer = async (prompt: string) => textOf(await run(reviewer, prompt));

  for (let round = 1; round <= maxRounds; round++) {
    plan = textOf(
      await run(
        coach,
        notes ? `${context}\n\nReviewer notes:\n${notes}\n\nRevise the previous plan:\n${plan}` : context,
      ),
    );
    const revisionContext = notes
      ? `Review round: ${round} of ${maxRounds}. This is a revised plan. Previous issues the coach was asked to fix:\n${notes}`
      : `Review round: ${round} of ${maxRounds}. This is the first coach draft.`;
    review = await reviewPlan(
      runReviewer,
      `${context}\n\n${revisionContext}\n\nCoach plan:\n${plan}`,
    );
    rounds = appendRound(rounds, round, plan, review);
    console.log(`Round ${round}: verdict=${review.verdict}, score=${review.score}, issues=${JSON.stringify(review.issues)}`);

    if (review.verdict === "needs_human_professional") {
      console.log("This request needs a specialist. Stopping.");
      return buildResult(plan, review, rounds, startedAt);
    }
    if (review.verdict === "approve") {
      writeFileSync("data/output.md", plan);
      console.log(`Plan saved to output.md. score=${review.score}`);
      return buildResult(plan, review, rounds, startedAt);
    }
    notes = review.issues.join("\n");
  }

  console.log(`Plan was not approved in ${maxRounds} rounds. output.md was not updated.`);
  return buildResult(plan, review!, rounds, startedAt);
}
