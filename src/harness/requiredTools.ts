import { formatRecentLog, readRecentLogResult } from "../skills/logs";
import { readProfile } from "../skills/profile";
import { wantsShoppingList, writeShoppingList } from "../skills/shopping";
import { pickWorkoutTemplate, wantsWorkout } from "../skills/workouts";
import type { ToolCallInfo } from "./collectToolCalls";

export type RequiredTool = {
  name: string;
  needed: (task: string) => boolean;
  /** Soft nudge text if the coach skipped this tool. */
  ask: string;
  /** Deterministic fetch when the model still skips after a nudge. */
  fallback: (task: string, plan: string) => { body: string; call: ToolCallInfo };
};

export const REQUIRED_TOOLS: RequiredTool[] = [
  {
    name: "getProfile",
    needed: (task) => /profile|constraint|allerg|my\b|мне|мо[еёйи]|профил/i.test(task),
    ask: "Call getProfile now. Then revise the draft using that profile.",
    fallback: () => ({ body: readProfile(), call: { name: "getProfile" } }),
  },
  {
    name: "getRecentLog",
    needed: (task) => /log|recent|yesterday|tomorrow|week|month|лог|дневник/i.test(task),
    ask: "Call getRecentLog now with days=7 (or up to 14). Then revise the draft using that log.",
    fallback: () => {
      const result = readRecentLogResult(7);
      return {
        body: formatRecentLog(result),
        call: {
          name: "getRecentLog",
          detail: `days=${result.requestedDays} → ${result.returnedDays} log day${result.returnedDays === 1 ? "" : "s"}`,
        },
      };
    },
  },
  {
    name: "suggestWorkoutTemplate",
    needed: wantsWorkout,
    ask: "Call suggestWorkoutTemplate now (goal matching the task, e.g. short home mobility). Then revise the draft so the workout section comes from that template.",
    fallback: (task) => ({
      body: pickWorkoutTemplate(task),
      call: { name: "suggestWorkoutTemplate" },
    }),
  },
  {
    name: "generateShoppingList",
    needed: wantsShoppingList,
    ask: "Call generateShoppingList now with this draft as planMarkdown. Then reply with the list the tool returns.",
    fallback: (_task, plan) => ({
      body: writeShoppingList(plan),
      call: { name: "generateShoppingList" },
    }),
  },
];
