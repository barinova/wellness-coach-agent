import { Agent } from "@openai/agents";
import { loadActivePrompt } from "../harness/promptVersions";

const MODEL = "composer-2.5";

export const coach = new Agent({
  name: "Health Coach",
  instructions: loadActivePrompt("coach"),
  model: MODEL,
});
