import { readDotEnv } from "./dotenv";

const DEFAULT_MODEL = "composer-2.5";

/** Active LLM id: `AGENT_MODEL` in env / `.env`, else `composer-2.5`. */
export function getAgentModel(): string {
  const fromProcess = process.env.AGENT_MODEL?.trim();
  if (fromProcess) return fromProcess;
  const fromFile = readDotEnv("AGENT_MODEL");
  return fromFile || DEFAULT_MODEL;
}
