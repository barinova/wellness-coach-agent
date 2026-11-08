# AGENTS.md

Instructions for Cursor when changing this repo.

## Product

Local wellness coach with a safety review loop. Not a medical product. Coach answers only the asked slice of nutrition, training, recovery, or habits. Reviewer can approve, ask for a rewrite, or stop for a human professional.

## Layout

- `src/agents/healthCoach.ts` / `src/agents/safetyReviewer.ts` — agent constructors; instructions from `prompts/`; coach gets tools, reviewer has none (no side effects)
- `src/skills/` — coach tools (`getProfile`, `getRecentLog`, `savePlan`, `generateShoppingList`, `suggestWorkoutTemplate`, `listFavoriteRecipes`); Zod + descriptions; simple array, no registry
- `prompts/healthCoach.v2.md`, `prompts/safetyReviewer.v1.md` — versioned prompt text; active versions in `src/harness/promptVersions.ts`
- `src/harness/runHealthAgent.ts` — orchestrator: medical keyword gate, coach/review loop (`maxRounds` default 3), required-tool nudge + harness fallback, gated `savePlan` on approve, returns `toolCalls`; best-effort `traceRun` on every exit
- `src/harness/traceRun.ts` — writes local JSON traces under `runs/` (write errors do not fail the run)
- `src/harness/requiredTools.ts` — which tools a task implies; soft nudge then deterministic fallback
- `src/harness/collectToolCalls.ts` — ordered `ToolCallInfo` (name + optional detail, e.g. getRecentLog days)
- `src/harness/cursorOpenAI.ts` — Cursor ↔ OpenAI chat_completions adapter with tool_calls bridge
- `src/harness/validateReview.ts` — Zod review schema + JSON parse with one retry
- `src/harness/rounds.ts` — `RoundState` history (includes per-round `toolCalls`)
- `src/harness/score.ts` — `finalScore` + `improved`
- `scripts/replay.ts` / `scripts/eval.ts` — local debug CLIs (`pnpm run replay`, `pnpm run eval`)
- `evals/cases/*.json` — mini-eval fixtures (including medical safety-gate case)
- `app/page.tsx` + `app/globals.css` — UI (duration, prompt versions, round history with tools, dynamics)
- `app/api/agent/run/route.ts` — POST `{ task }`, Node runtime, 300s
- `data/profile.md` — tracked seed profile; `data/log.md`, `data/recipes.md`, `data/output.md`, `data/shopping.md` — local/generated via coach tools (gitignored)
- `runs/` — local JSON run traces (gitignored except `runs/run-example.json`)
- `design-system/health-coach/MASTER.md` — visual source of truth (healthcare tokens in CSS may override the bio-red palette)

## Commands

Use **pnpm** only. `npm` / `yarn` / `bun` are blocked.

```bash
pnpm install
pnpm run dev
pnpm run build
pnpm run replay -- runs/run-example.json
pnpm run eval
```

Open **http://localhost:3000**. A coach run often takes 15–90 seconds; keep the tab open until it finishes.

`.env` needs `CURSOR_API_KEY`. Optional `AGENT_MODEL` (default `composer-2.5`) selects the Cursor model for coach, reviewer, and traces. Document new keys only in `.env.example`. Do not commit `.env`. Do not log the key.

## Codebase principles

- Keep the codebase high-model: names and structure that a reader (or an LLM) can follow without archaeology.
- Separation of concerns: one module, one job. Do not mix UI, HTTP, prompts, and the review loop. Put new behavior next to its existing owner (`src/agents`, harness, `app/`, `data/`), not in a catch-all file.
- Small, typed TypeScript. No unused code. No new dependencies unless the task needs them.
- Keep docs accurate — `AGENTS.md`, `README.md`, and comments only where the code is not enough. Update them in the same change as the code.
- Stay on-scope in product behavior: no extra meals, training, or sleep sections unless the task asked for them.
- UI: semantic tokens in `app/globals.css`, visible labels, errors next to the field with `role="alert"`, visible `:focus-visible`, 44px targets, `prefers-reduced-motion`. No emoji as icons.
- Do not rewrite `data/profile.md` / `data/log.md` unless asked.

## Safety and agent configuration

- Keep the coach/review loop in the harness (`src/harness/runHealthAgent.ts`). Do not move coach/reviewer calls into the UI.
- Medical keyword gate and `needs_human_professional` stay in front of coaching. Do not weaken them.
- Tools belong only on the Health Coach. Safety Reviewer stays text-in / JSON-out with no tools or file side effects.
- `savePlan` writes are gated by the harness after reviewer approve — do not rely on the prompt alone.
- Coach and reviewer prompts stay in English under `prompts/*.md`. Change prompt text there (or bump `ACTIVE_PROMPTS` in `src/harness/promptVersions.ts`); do not duplicate copy in the UI.
- This is not a medical product: no diagnoses, treatment, medications, dosages, or symptom interpretation in coach output.
- Never commit `.env`, API keys, or secrets. Never log `CURSOR_API_KEY`.
- AI coding agents must not read, open, print, edit, or append `.env` (or other secret files). Update `.env.example` only; tell the human which keys to set locally. App runtime code may still load `.env` on disk — that is not an invitation for the agent to inspect it.
- Prefer pnpm-only tooling already enforced by `packageManager`, `engines`, and `scripts/only-pnpm.mjs`.

## Testing

- Do **not** write tests for the app. AI agents must not add unit, integration, e2e, or snapshot tests unless the user explicitly asks.
- Do **not** use TDD. Do not create failing tests first, then implement.
- Do not add test files, test scripts, test runners, or testing libraries (Jest, Vitest, Playwright, Testing Library, etc.) unless the user explicitly asks.
- Verify changes with `pnpm run build` and by running the app (`pnpm run dev`) against real flows.

## Review and code analysis

- Before finishing a change, re-read the diff for unused code, broken separation of concerns, weakened safety gates, and docs that no longer match the code.
- Prefer a short self-check over new tooling: typecheck/build via `pnpm run build`, smoke the UI path that changed, confirm medical gate behavior still blocks medication/diagnosis/treatment tasks.
- Do not invent a separate analysis pipeline, linter config, or CI matrix unless the user asks.
- When reviewing prompts or harness behavior, judge against product rules: on-scope wellness only, English coach/reviewer copy, and human-professional routing when the task is medical.

## Commits and pull requests

- Do not create commits or push unless the user explicitly asks in that message.
- If there are local changes that could be committed, ask whether to commit and whether to push; wait for a clear yes.
- Commit messages: short, focus on why, match the repo style. Never commit `.env` or secrets.
- Pull requests: summarize intent and risk (especially safety/harness/UI), list how you verified (`pnpm run build`, manual run). Keep PRs small and scoped to one concern when possible.
- Do not use `--no-verify`, force-push to `main`/`master`, or rewrite history unless the user explicitly requests it.
