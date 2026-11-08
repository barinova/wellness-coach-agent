# wellness-coach-agent

Local Health Coach + Safety Reviewer. The harness in `src/harness/` runs the coach/review loop with versioned prompts under `prompts/`. The coach uses tools in `src/skills/` (profile, log, recipes, shopping, workouts, gated save); the reviewer has no tools. Use the Next.js UI to run it; the result shows rounds, scores, prompt versions, duration, and which tools ran.

## Setup

Copy `.env.example` to `.env` and set `CURSOR_API_KEY`. Optional: set `AGENT_MODEL` to switch the Cursor model (default `composer-2.5`).

```bash
pnpm install
```

This repo accepts **pnpm only**. `npm`, `yarn`, and `bun` will fail.

## Web UI

```bash
pnpm run dev
```

Open **http://localhost:3000** (not the Network IP), enter a task, click **Run agent**. A run often takes 15–90 seconds. On `approve`, the harness saves via `savePlan` to `data/output.md`. Shopping lists go to `data/shopping.md` when that tool runs.

## Как дебажить агента

Цикл: **trace → replay → eval**.

1. **Trace** — каждый запуск (UI или CLI) пишет `runs/run-<timestamp>.json` (ошибка записи не роняет агента). Пример схемы: `runs/run-example.json`.
2. **Replay** — тот же `task` через текущий harness, сравнение old vs new:

```bash
pnpm run replay -- runs/run-example.json
```

3. **Eval** — пять кейсов в `evals/cases/`, таблица PASS/FAIL (`bad-medical-request` проходит только при `needs_human_professional`):

```bash
pnpm run eval
```

