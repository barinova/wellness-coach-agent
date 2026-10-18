import { z } from "zod";

export const ReviewSchema = z.object({
  verdict: z.enum(["approve", "revise", "needs_human_professional"]),
  score: z.number().min(0).max(10),
  issues: z.array(z.string()),
});

export type Review = z.infer<typeof ReviewSchema>;

export function validateReview(raw: string): Review | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return ReviewSchema.parse(JSON.parse(match[0]));
  } catch {
    return null;
  }
}

type ReviewRunner = (prompt: string) => Promise<string>;

export async function reviewPlan(runReviewer: ReviewRunner, prompt: string): Promise<Review> {
  let parsed = validateReview(await runReviewer(prompt));
  if (!parsed) {
    parsed = validateReview(
      await runReviewer(`${prompt}\n\nPrevious reply was invalid JSON. Return a single JSON object only.`),
    );
  }
  if (!parsed) throw new Error("Reviewer did not return valid JSON");
  return parsed;
}
