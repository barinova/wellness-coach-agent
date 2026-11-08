import { tool } from "@openai/agents";
import { z } from "zod";

const TEMPLATES: { keys: string[]; title: string; body: string }[] = [
  {
    keys: ["strength", "muscle", "gym", "lift"],
    title: "Gym strength (45 min)",
    body: [
      "Warm-up: 5 min easy bike or walk + hip/shoulder openers.",
      "Squat pattern 3×8, hinge 3×8, push 3×8, pull 3×8 (moderate load).",
      "Core: dead bug 2×8/side.",
      "Cool-down: 3 min easy walk, calf and hip flexor stretch.",
    ].join("\n"),
  },
  {
    keys: ["mobility", "desk", "stretch", "yoga"],
    title: "Desk-day mobility (20 min)",
    body: [
      "Neck and shoulder rolls 1 min.",
      "Cat–cow 8 reps, world's greatest stretch 5/side.",
      "Hip flexor stretch 45s/side, thoracic opener 45s/side.",
      "Ankle rocks 10/side; finish with easy walk 2 min.",
    ].join("\n"),
  },
  {
    keys: ["walk", "cardio", "endurance", "zone"],
    title: "Easy cardio walk (30 min)",
    body: [
      "5 min easy start.",
      "20 min conversational pace (nose breathing if possible).",
      "5 min cool-down + calf stretch.",
    ].join("\n"),
  },
  {
    keys: ["home", "bodyweight", "no equipment", "apartment"],
    title: "Home bodyweight circuit (25 min)",
    body: [
      "3 rounds: 10 sit-to-stands, 8 incline push-ups, 12 glute bridges, 20s plank.",
      "Rest 60–90s between rounds.",
      "Finish: 2 min easy march in place.",
    ].join("\n"),
  },
];

export function pickWorkoutTemplate(goal: string): string {
  const g = goal.toLowerCase();
  const hit =
    TEMPLATES.find((t) => t.keys.some((k) => g.includes(k))) ?? TEMPLATES[TEMPLATES.length - 1];
  return `## ${hit.title}\n\n${hit.body}\n`;
}

export const suggestWorkoutTemplate = tool({
  name: "suggestWorkoutTemplate",
  description:
    "Return one hardcoded workout template matched loosely to a training goal (strength, mobility, walk/cardio, or home/bodyweight). Use when the user asks for a workout outline; does not invent medical rehab programs.",
  parameters: z.object({
    goal: z
      .string()
      .min(1)
      .describe("Short training goal, e.g. 'desk mobility', 'gym strength', 'easy walk'."),
  }),
  execute: async ({ goal }) => pickWorkoutTemplate(goal),
});
