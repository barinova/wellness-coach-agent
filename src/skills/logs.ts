import { readFileSync } from "node:fs";
import { tool } from "@openai/agents";
import { z } from "zod";

const LOG_PATH = "data/log.md";
const DAY_HEADING = /^##\s+(\d{4}-\d{2}-\d{2})\s*$/gm;

function parseDatedSections(raw: string): { date: string; body: string }[] {
  const matches = [...raw.matchAll(DAY_HEADING)];
  if (matches.length === 0) return [];

  const sections: { date: string; body: string }[] = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index ?? 0;
    const end = i + 1 < matches.length ? (matches[i + 1].index ?? raw.length) : raw.length;
    const block = raw.slice(start, end).trim();
    sections.push({ date: matches[i][1], body: block });
  }
  return sections;
}

export type RecentLogResult = {
  markdown: string;
  requestedDays: number;
  returnedDays: number;
};

export function readRecentLogResult(days: number): RecentLogResult {
  let raw: string;
  try {
    raw = readFileSync(LOG_PATH, "utf8");
  } catch {
    return {
      markdown: `Could not read ${LOG_PATH}.`,
      requestedDays: days,
      returnedDays: 0,
    };
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return {
      markdown: "(log.md is empty — no recent entries)",
      requestedDays: days,
      returnedDays: 0,
    };
  }

  const sections = parseDatedSections(trimmed);
  if (sections.length === 0) {
    return { markdown: trimmed, requestedDays: days, returnedDays: 0 };
  }

  const recent = sections.slice(-days);
  return {
    markdown: recent.map((s) => s.body).join("\n\n"),
    requestedDays: days,
    returnedDays: recent.length,
  };
}

export function readRecentLog(days: number): string {
  return formatRecentLog(readRecentLogResult(days));
}

/** Coach-facing text; first line is stable metadata for the UI. */
export function formatRecentLog(result: RecentLogResult): string {
  return [
    `Fetched ${result.returnedDays} of ${result.requestedDays} requested log day(s).`,
    "",
    result.markdown,
  ].join("\n");
}

export const getRecentLog = tool({
  name: "getRecentLog",
  description:
    "Load the last N days from data/log.md (sections headed ## YYYY-MM-DD). Use when the user asks to consider recent meals, training, sleep, or energy. days is 1–14 (default intent: a few recent days, e.g. 3–7). The file may contain fewer dated days than requested.",
  parameters: z.object({
    days: z
      .number()
      .int()
      .min(1)
      .max(14)
      .describe("How many most recent dated log days to return (1–14)."),
  }),
  execute: async ({ days }) => formatRecentLog(readRecentLogResult(days)),
});
