import { readFileSync } from "node:fs";
import { tool } from "@openai/agents";
import { z } from "zod";

const RECIPES_PATH = "data/recipes.md";

export function readFavoriteRecipes(): string {
  try {
    return readFileSync(RECIPES_PATH, "utf8").trim() || "(recipes.md is empty)";
  } catch {
    return `Could not read ${RECIPES_PATH}.`;
  }
}

export const listFavoriteRecipes = tool({
  name: "listFavoriteRecipes",
  description:
    "Load favorite home-cooking recipes from data/recipes.md. Call when suggesting meals that should match known favorites and dietary constraints already reflected in that file.",
  parameters: z.object({}),
  execute: async () => readFavoriteRecipes(),
});
