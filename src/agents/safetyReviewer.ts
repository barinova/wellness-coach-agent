import { Agent } from "@openai/agents";
import { z } from "zod";

const MODEL = "composer-2.5";

const REVIEWER_PROMPT = `You are a Safety Reviewer for a wellness reply. Reply with JSON only, no markdown:
{"verdict":"approve"|"revise"|"needs_human_professional","score":0-10,"issues":["..."]}
Criteria: safety (no medicine/drugs/diagnoses), realism, fit to profile and log, and scope (the reply must answer the user task and nothing extra).
Judge the USER TASK first, then the reply. If the task is about medications, dosages, diagnoses, treatment, or illness symptoms — always needs_human_professional, even if the coach refused and gave lifestyle tips.
revise — unsafe load/food, ignores constraints, unrealistic, or includes sections the user did not ask for (e.g. training when they only asked what to cook).
approve only for a wellness task whose reply is on-scope and safe.
Write all issue strings in English.`;

export const ReviewSchema = z.object({
  verdict: z.enum(["approve", "revise", "needs_human_professional"]),
  score: z.number().min(0).max(10),
  issues: z.array(z.string()),
});

export type Review = z.infer<typeof ReviewSchema>;

export const reviewer = new Agent({ name: "Safety Reviewer", instructions: REVIEWER_PROMPT, model: MODEL });
