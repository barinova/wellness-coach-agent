import { writeFileSync } from "node:fs";
import { tool } from "@openai/agents";
import { z } from "zod";

const SHOPPING_PATH = "data/shopping.md";

const SKIP = new Set(
  [
    "the",
    "and",
    "with",
    "from",
    "into",
    "over",
    "under",
    "then",
    "this",
    "that",
    "your",
    "plate",
    "steps",
    "min",
    "minutes",
    "hour",
    "hours",
    "serve",
    "serves",
    "optional",
    "about",
    "small",
    "large",
    "cup",
    "cups",
    "tbsp",
    "tsp",
    "slice",
    "slices",
    "piece",
    "pieces",
    "why",
    "fits",
    "one",
    "two",
    "add",
    "use",
    "start",
    "cook",
    "heat",
    "pan",
    "pot",
    "bowl",
  ].map((w) => w.toLowerCase()),
);

/** Heuristic ingredient lines from plan markdown — local only, no NLP APIs. */
export function buildShoppingList(planMarkdown: string): string {
  const candidates = new Set<string>();
  const lines = planMarkdown.split(/\r?\n/);

  for (const line of lines) {
    const cleaned = line
      .replace(/^[#>*\-\d.\s]+/, "")
      .replace(/\([^)]*\)/g, "")
      .replace(/\d+\s*[-–]?\s*\d*\s*(min|minutes|hour|hours|g|ml|oz|lb)\b/gi, "")
      .trim();
    if (!cleaned || cleaned.length < 3) continue;

    for (const part of cleaned.split(/,|\/|;|\band\b/i)) {
      const item = part
        .replace(/\b(a|an|the|some|fresh|cooked|steamed|pan-?fried|minced|sliced|chopped)\b/gi, "")
        .replace(/[^a-zA-Z\s\-']/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
      if (!item || item.length < 3 || item.length > 40) continue;
      if (SKIP.has(item)) continue;
      if (/^(step|round|score|plan|task)/.test(item)) continue;
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
    "Build a simple shopping list from a meal/plan markdown, write it to data/shopping.md, and return the list text. Call when the user asks for groceries or a shopping list for a plan you already have (pass that plan markdown).",
  parameters: z.object({
    planMarkdown: z
      .string()
      .min(1)
      .describe("The meal or wellness plan markdown to extract grocery items from."),
  }),
  execute: async ({ planMarkdown }) => writeShoppingList(planMarkdown),
});
