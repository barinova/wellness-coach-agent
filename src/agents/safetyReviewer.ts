import { Agent } from "@openai/agents";
import { getAgentModel } from "../harness/agentModel";
import { loadActivePrompt } from "../harness/promptVersions";

// Reviewer stays side-effect free: no tools — only plan text in, JSON review out.
// Built per call so AGENT_MODEL from `.env` applies without relying on a stale singleton.
export function createSafetyReviewer() {
  return new Agent({
    name: "Safety Reviewer",
    instructions: loadActivePrompt("reviewer"),
    model: getAgentModel(),
  });
}
