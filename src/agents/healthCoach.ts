import { Agent } from "@openai/agents";
import { getAgentModel } from "../harness/agentModel";
import { loadActivePrompt } from "../harness/promptVersions";
import { getRecentLog } from "../skills/logs";
import { createSavePlanTool } from "../skills/plans";
import { getProfile } from "../skills/profile";
import { listFavoriteRecipes } from "../skills/recipes";
import type { SavePlanGate } from "../skills/saveGate";
import { generateShoppingList } from "../skills/shopping";
import { suggestWorkoutTemplate } from "../skills/workouts";

/** Coach agent with a simple tools array; savePlan is gated per run via `gate`. */
export function createHealthCoach(gate: SavePlanGate) {
  return new Agent({
    name: "Health Coach",
    instructions: loadActivePrompt("coach"),
    model: getAgentModel(),
    tools: [
      getProfile,
      getRecentLog,
      createSavePlanTool(gate),
      generateShoppingList,
      suggestWorkoutTemplate,
      listFavoriteRecipes,
    ],
  });
}
