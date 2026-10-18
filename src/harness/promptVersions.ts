import { readFileSync } from "node:fs";
import { join } from "node:path";

export const ACTIVE_PROMPTS: { coach: string; reviewer: string } = {
  coach: "v1",
  reviewer: "v1",
};

export type PromptName = "healthCoach" | "safetyReviewer";

const PROMPT_FILE: Record<keyof typeof ACTIVE_PROMPTS, PromptName> = {
  coach: "healthCoach",
  reviewer: "safetyReviewer",
};

export function loadPrompt(name: PromptName, version: string): string {
  const path = join(process.cwd(), "prompts", `${name}.${version}.md`);
  try {
    return readFileSync(path, "utf8").trim();
  } catch {
    throw new Error(`Missing prompt file: prompts/${name}.${version}.md`);
  }
}

export function activePromptVersions(): { coach: string; reviewer: string } {
  return { coach: ACTIVE_PROMPTS.coach, reviewer: ACTIVE_PROMPTS.reviewer };
}

export function loadActivePrompt(role: keyof typeof ACTIVE_PROMPTS): string {
  return loadPrompt(PROMPT_FILE[role], ACTIVE_PROMPTS[role]);
}
