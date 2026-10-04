import { readFileSync, writeFileSync } from "node:fs";
import { Agent as CursorAgent } from "@cursor/sdk";
import { Agent, run, setDefaultOpenAIClient, setOpenAIAPI, setTracingDisabled } from "@openai/agents";
import OpenAI from "openai";
import { z } from "zod";

// Key comes only from .env; Cursor/IDE often injects CURSOR_API_KEY into process env
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

const apiKey = apiKeyFromEnvFile();

// Cheapest Cursor Models pool option; fast=false, otherwise billed as composer-2.5-fast
const MODEL = "composer-2.5";
const MAX_ROUNDS = 3;

setTracingDisabled(true);
setOpenAIAPI("chat_completions");
// api.cursor.com has no /chat/completions — route calls through the Cursor SDK
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

const COACH_PROMPT = `You are a Health Coach. Answer ONLY the user's task. Do not add unasked topics (training, sleep, breakfast, a full day plan, extra meals) unless they asked for them.
Stay in nutrition, training, recovery, and habits — and only the slice they asked about.
This is not a medical product: no diagnoses, treatment, medications, dosages, or symptom interpretation.
If the request is medical, refuse briefly and suggest seeing a professional, with no treatment plan.
Reply in short markdown. Use the profile and log. Keep time and load realistic.`;

const REVIEWER_PROMPT = `You are a Safety Reviewer for a wellness reply. Reply with JSON only, no markdown:
{"verdict":"approve"|"revise"|"needs_human_professional","score":0-10,"issues":["..."]}
Criteria: safety (no medicine/drugs/diagnoses), realism, fit to profile and log, and scope (the reply must answer the user task and nothing extra).
Judge the USER TASK first, then the reply. If the task is about medications, dosages, diagnoses, treatment, or illness symptoms — always needs_human_professional, even if the coach refused and gave lifestyle tips.
revise — unsafe load/food, ignores constraints, unrealistic, or includes sections the user did not ask for (e.g. training when they only asked what to cook).
approve only for a wellness task whose reply is on-scope and safe.`;

const ReviewSchema = z.object({
  verdict: z.enum(["approve", "revise", "needs_human_professional"]),
  score: z.number().min(0).max(10),
  issues: z.array(z.string()),
});

const coach = new Agent({ name: "Health Coach", instructions: COACH_PROMPT, model: MODEL });
const reviewer = new Agent({ name: "Safety Reviewer", instructions: REVIEWER_PROMPT, model: MODEL });

const textOf = (r: { finalOutput?: unknown }) => String(r.finalOutput ?? "").trim();

function parseReview(raw: string) {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return ReviewSchema.parse(JSON.parse(match[0]));
  } catch {
    return null;
  }
}

async function reviewPlan(prompt: string) {
  let parsed = parseReview(textOf(await run(reviewer, prompt)));
  if (!parsed) {
    parsed = parseReview(
      textOf(await run(reviewer, `${prompt}\n\nPrevious reply was invalid JSON. Return a single JSON object only.`)),
    );
  }
  if (!parsed) throw new Error("Reviewer did not return valid JSON");
  return parsed;
}

const task = process.argv.slice(2).join(" ").trim();
if (!task) throw new Error('Usage: npx tsx index.ts "task"');

// Stop medical requests in code; do not rely on the model
if (
  /tablet|pill|medication|medicine|drug|diagnos|treatment|dosage|antibiotic|prescription|таблетк|лекарств|препарат|диагноз\b|лечени[еюя]|дозировк|антибиот|рецепт/i.test(
    task,
  )
) {
  console.log(
    `Round 1: verdict=needs_human_professional, score=0, issues=${JSON.stringify(["Request is about medication, diagnosis, or treatment — outside wellness coaching"])}`,
  );
  console.log("This request needs a specialist. Stopping.");
  process.exit(0);
}

const profile = readFileSync("profile.md", "utf8");
const log = readFileSync("log.md", "utf8");
const context = `Task:\n${task}\n\nProfile:\n${profile}\n\nLog:\n${log}`;

let plan = "";
let notes = "";

for (let round = 1; round <= MAX_ROUNDS; round++) {
  // Coach → reviewer; on revise, send issues back to the coach
  plan = textOf(
    await run(
      coach,
      notes ? `${context}\n\nReviewer notes:\n${notes}\n\nRevise the previous plan:\n${plan}` : context,
    ),
  );
  const review = await reviewPlan(`${context}\n\nCoach plan:\n${plan}`);
  console.log(`Round ${round}: verdict=${review.verdict}, score=${review.score}, issues=${JSON.stringify(review.issues)}`);

  if (review.verdict === "needs_human_professional") {
    console.log("This request needs a specialist. Stopping.");
    process.exit(0);
  }
  if (review.verdict === "approve") {
    writeFileSync("output.md", plan);
    console.log(`Plan saved to output.md. score=${review.score}`);
    process.exit(0);
  }
  notes = review.issues.join("\n");
}

console.log("Plan was not approved in 3 rounds. output.md was not updated.");
