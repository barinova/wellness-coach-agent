import { Agent } from "@openai/agents";
import { loadActivePrompt } from "../harness/promptVersions";

const MODEL = "composer-2.5";

export const reviewer = new Agent({
  name: "Safety Reviewer",
  instructions: loadActivePrompt("reviewer"),
  model: MODEL,
});
