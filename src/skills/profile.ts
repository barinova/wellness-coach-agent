import { readFileSync } from "node:fs";
import { tool } from "@openai/agents";
import { z } from "zod";

const PROFILE_PATH = "data/profile.md";

export function readProfile(): string {
  try {
    return readFileSync(PROFILE_PATH, "utf8").trim() || "(profile.md is empty)";
  } catch {
    return `Could not read ${PROFILE_PATH}.`;
  }
}

export const getProfile = tool({
  name: "getProfile",
  description:
    "Load the user's wellness profile from data/profile.md (goals, constraints, preferences, schedule). Call this when the plan should respect allergies, equipment, or personal goals. Returns markdown text.",
  parameters: z.object({}),
  execute: async () => readProfile(),
});
