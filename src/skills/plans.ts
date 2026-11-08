import { writeFileSync } from "node:fs";
import { tool } from "@openai/agents";
import { z } from "zod";
import type { SavePlanGate } from "./saveGate";

const OUTPUT_PATH = "data/output.md";

/**
 * Writes the approved plan to data/output.md.
 * Harness must set gate.allowSavePlan after reviewer approve — prompts alone
 * cannot be trusted to prevent overwriting output with an unapproved draft.
 */
export function savePlanMarkdown(markdown: string): { ok: true } {
  writeFileSync(OUTPUT_PATH, markdown);
  return { ok: true };
}

export function createSavePlanTool(gate: SavePlanGate) {
  return tool({
    name: "savePlan",
    description:
      "Persist an approved wellness plan to data/output.md. Only succeeds after the safety reviewer has approved; otherwise returns an error and does not write. Prefer drafting in your reply — the harness saves on approve.",
    parameters: z.object({
      markdown: z.string().min(1).describe("Full plan markdown to write to data/output.md."),
    }),
    execute: async ({ markdown }) => {
      // Soft prompt instructions are not enough: block side effects until harness opens the gate.
      if (!gate.allowSavePlan) {
        return "Save blocked: the safety reviewer has not approved yet. Do not retry until approve; put the plan in your reply text instead.";
      }
      return JSON.stringify(savePlanMarkdown(markdown));
    },
  });
}
