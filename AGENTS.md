# AGENTS.md

Instructions for Cursor when changing this repo.

## Product

Local wellness coach with a safety review loop. Not a medical product. Coach answers only the asked slice of nutrition, training, recovery, or habits. Reviewer can approve, ask for a rewrite, or stop for a human professional.

## Layout

- `src/agents/healthCoach.ts` — coach prompt and model
- `src/agents/safetyReviewer.ts` — reviewer prompt, JSON schema
- `src/harness/runHealthAgent.ts` — medical keyword gate, up to 3 coach/review rounds, writes `data/output.md` on approve
- `app/page.tsx` + `app/globals.css` — UI
- `app/api/agent/run/route.ts` — POST `{ task }`, Node runtime, 300s
- `data/profile.md`, `data/log.md` — user context; `data/output.md` — last approved plan
- `design-system/health-coach/MASTER.md` — visual source of truth (healthcare tokens in CSS may override the bio-red palette)

## Commands

Use **pnpm** only. `npm` / `yarn` / `bun` are blocked.

```bash
pnpm install
pnpm run dev
pnpm run build
```

Open **http://localhost:3000**. A coach run often takes 15–90 seconds; keep the tab open until it finishes.

`.env` needs `CURSOR_API_KEY`. Do not commit `.env`. Do not log the key.

## Rules

- Keep the loop in the harness. Do not move coach/reviewer calls into the UI.
- Medical keyword gate and `needs_human_professional` stay in front of coaching. Do not weaken them.
- Coach and reviewer copy stay in English. Change prompts in the agent files, not by duplicating them in the UI.
- Stay on-scope: no extra meals, training, or sleep sections unless the task asked for them.
- UI: semantic tokens in `app/globals.css`, visible labels, errors next to the field with `role="alert"`, visible `:focus-visible`, 44px targets, `prefers-reduced-motion`. No emoji as icons.
- Small, typed TypeScript. No unused code. No new dependencies unless the task needs them.
- Keep the codebase high-model: names and structure that a reader (or an LLM) can follow without archaeology. Keep docs accurate — `AGENTS.md`, `README.md`, and comments only where the code is not enough. Update them in the same change as the code.
- Separation of concerns: one module, one job. Do not mix UI, HTTP, prompts, and the review loop. Put new behavior next to its existing owner (`src/agents`, harness, `app/`, `data/`), not in a catch-all file.
- Do not rewrite `data/profile.md` / `data/log.md` unless asked.
- Do not write tests. Do not use TDD. Do not add test files, test scripts, or testing libraries unless the user explicitly asks. Verify with `pnpm run build` and by running the app.
