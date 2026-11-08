import { writeFileSync } from "node:fs";
import { tool } from "@openai/agents";
import { z } from "zod";

const SHOPPING_PATH = "data/shopping.md";

/** Task asks for a grocery list. Used so the harness can nudge the writer tool. */
export function wantsShoppingList(task: string): boolean {
  return /shopping|grocer|список покупок|покупк/i.test(task);
}

const SKIP_ITEM =
  /^(item|qty|amount|ingredient|for|no|without|not|avoid|skip|optional|and|with|the)\b|\b(plan|minutes?|recipe|serves|step)\b/;

/** Bullet and table rows only — local heuristic, no NLP APIs. */
export function buildShoppingList(planMarkdown: string): string {
  const candidates = new Set<string>();

  for (const line of planMarkdown.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || /^\|?\s*-{3,}/.test(trimmed)) continue;

    const bullet = trimmed.match(/^(?:[-*]|\d+[.)])\s+(.+)$/);
    const cell = trimmed.startsWith("|")
      ? trimmed.split("|").map((part) => part.trim()).filter(Boolean)[0]
      : undefined;
    const raw = bullet?.[1] ?? cell;
    if (!raw) continue;

    for (const part of raw.split(/,|;|\band\b|\//i)) {
      const item = part
        .replace(/\([^)]*\)/g, " ")
        .replace(/^(breakfast|lunch|dinner|snack|supper)\b/i, " ")
        .replace(/\b\d+([./]\d+)?\s*(g|kg|ml|l|oz|lb|tbsp|tsp|cups?|min|minutes)?\b/gi, " ")
        .replace(/[~—–].*$/, " ")
        .replace(/[^a-zA-Z\s'-]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
      if (item.length < 3 || item.length > 36 || item.split(" ").length > 4) continue;
      if (SKIP_ITEM.test(item)) continue;
      candidates.add(item);
    }
  }

  const items = [...candidates].sort();
  if (items.length === 0) {
    return "# Shopping list\n\n(No clear ingredients found in the plan — list staples manually.)\n";
  }

  return ["# Shopping list", "", ...items.map((i) => `- ${i}`), ""].join("\n");
}

export function writeShoppingList(planMarkdown: string): string {
  const list = buildShoppingList(planMarkdown);
  writeFileSync(SHOPPING_PATH, list);
  return list;
}

export const generateShoppingList = tool({
  name: "generateShoppingList",
  description:
    "Build a simple shopping list from meal-plan markdown, write it to data/shopping.md, and return the list text. Call this whenever the user asks for groceries or a shopping list — you cannot write that file any other way. Pass the plan markdown (draft it first from profile, log, or recipes if this turn does not already contain a plan).",
  parameters: z.object({
    planMarkdown: z
      .string()
      .min(1)
      .describe("The meal or wellness plan markdown to extract grocery items from."),
  }),
  execute: async ({ planMarkdown }) => writeShoppingList(planMarkdown),
});
