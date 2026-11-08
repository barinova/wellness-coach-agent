import { Agent } from "@openai/agents";
import { loadActivePrompt } from "../harness/promptVersions";

const MODEL = "composer-2.5";

// Reviewer stays side-effect free: no tools — only plan text in, JSON review out.
export const reviewer = new Agent({
  name: "Safety Reviewer",
  instructions: loadActivePrompt("reviewer"),
  model: MODEL,
});
