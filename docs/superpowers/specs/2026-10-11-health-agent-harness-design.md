# Health Agent Harness Design

Date: 2026-10-11  
Status: approved for implementation planning

## Goal

Turn `runHealthAgent` from a script-with-a-loop into a real harness: thin control layer around coach/reviewer agents, versioned prompts on disk, richer run result, and a result UI that matches the Safety review mock (English copy).

Coach/reviewer behavior and prompt wording stay the same; only structure, observability fields, and UI presentation change.

## Non-goals

- Trace persistence (beyond existing `data/output.md` on approve)
- Evals, replay, databases, external services
- Tests / TDD
- Changing medical gate rules or prompt text content
- New npm dependencies

## Architecture

```
app/page.tsx  →  POST /api/agent/run  →  runHealthAgent (orchestrator)
                                              ├─ promptVersions (ACTIVE_PROMPTS + file load)
                                              ├─ agents (coach / reviewer, instructions from files)
                                              ├─ validateReview (Zod + one retry)
                                              ├─ rounds (RoundState history)
                                              └─ score (finalScore + improved)
```

Each harness file has one responsibility. No shared utils dump.

## Module responsibilities

### `src/harness/promptVersions.ts`

- `ACTIVE_PROMPTS = { coach: "v1", reviewer: "v1" }`
- `loadPrompt(name: "healthCoach" | "safetyReviewer", version: string): string`  
  reads `prompts/<name>.<version>.md` synchronously (`readFileSync`, path relative to process cwd / repo root).
- Export active version map for the result payload.

### `prompts/healthCoach.v1.md` / `prompts/safetyReviewer.v1.md`

- Exact current English prompt text moved out of `src/agents/*.ts`.
- Adding `*.v2.md` + changing `ACTIVE_PROMPTS` switches behavior without other code edits.

### `src/harness/validateReview.ts`

- Owns `ReviewSchema` and `Review` type (moved from `safetyReviewer.ts`).
- `validateReview(raw: string): Review | null` — extract first JSON object, Zod parse.
- `reviewPlan(runReviewer, prompt): Promise<Review>` — call reviewer, on invalid JSON one retry with the same “invalid JSON / return a single JSON object only” instruction as today; then throw if still invalid.

### `src/harness/rounds.ts`

- `RoundState = { round: number; plan: string; review: Review }`
- Helpers to create empty history and append a round. No scoring.

### `src/harness/score.ts`

- `finalScore(rounds): number | null` — score of the last round whose verdict is `approve`; otherwise `null`.
- `improved(rounds): boolean` — true iff for some consecutive pair `rounds[i].review.score > rounds[i - 1].review.score`. Single round → false (“No score growth”).

### `src/harness/runHealthAgent.ts`

- Public API: `runHealthAgent(task: string, maxRounds = 3): Promise<HealthAgentResult>`
- Owns: Cursor/OpenAI client bootstrap, medical keyword gate, coach↔review loop, `data/output.md` write on approve, console logs, assembling the result.
- Does not own Zod schema text, score math, or prompt file I/O details beyond calling helpers.

### Agents

- `healthCoach.ts` / `safetyReviewer.ts`: construct `Agent` with `instructions: loadPrompt(..., ACTIVE_PROMPTS.*)` and existing model id.
- Schema/types live only in `validateReview.ts`. `runHealthAgent.ts` re-exports `Review` so existing imports from the harness keep working.

## Result shape

```ts
type RoundState = {
  round: number;
  plan: string;
  review: Review;
};

type HealthAgentResult = {
  plan: string;
  review: Review;
  rounds: RoundState[];
  finalScore: number | null;
  improved: boolean;
  promptVersions: { coach: string; reviewer: string };
  durationMs: number;
};
```

Notes:

- `rounds` changes from `number` to `RoundState[]` (intentional breaking change for UI/API consumers in this repo only).
- `durationMs` measured from start of `runHealthAgent` to just before return (all exit paths).
- `promptVersions` mirrors `ACTIVE_PROMPTS` values used for that run.

### Medical keyword gate

Before coaching: same regex and issue string as today.

Return:

- `plan: ""`
- `review`: synthetic `needs_human_professional` (unchanged)
- `rounds`: one `RoundState` `{ round: 1, plan: "", review }` so the history UI works
- `finalScore: null`, `improved: false`
- real `durationMs` and `promptVersions`

### Normal loop

For `round` from 1 to `maxRounds`:

1. Run coach (with reviewer notes + previous plan on revisions).
2. `reviewPlan` via validateReview.
3. Append `RoundState`.
4. On `needs_human_professional` → stop (no `output.md`).
5. On `approve` → write `data/output.md`, stop.
6. Else set notes from `issues`, continue.

If never approved: return last plan/review; do not write `output.md`. Log copy may say “not approved in N rounds” using `maxRounds`.

## API

`app/api/agent/run/route.ts` unchanged in contract: `POST { task }` → stream JSON of `HealthAgentResult` (or `{ error }`). No `maxRounds` from the client in this iteration.

## UI (match mock, English)

Update `app/page.tsx` result section to mirror the screenshot layout using existing design tokens and shadcn components:

1. **Header** — “Safety review” + verdict badge; subtitle “Coach → reviewer”.
2. **Safety score** — prefer `finalScore ?? review.score` for display; progress bar; label “Safety score”.
3. **Review rounds** — filled/empty dots for `rounds.length / maxRounds` (default 3) + `n/3` text.
4. **Meta rows**
   - Time: `durationMs` formatted as whole seconds (`39 s`).
   - Prompts: `coach v1 / reviewer v1`.
   - Dynamics: `Score improved` if `improved`, else `No score growth`.
5. **Round history** — collapsible (`<details>` or equivalent); each item: `Round N` — verdict badge — `score X/10`.
6. **Remarks** — issues list, or “No issues” with success affordance when empty.

Keep: task form, loading skeletons, specialist alert, plan card when not specialist-blocked.  
No emoji icons; Lucide only. Accessible labels, `role="alert"` for errors, 44px targets, `prefers-reduced-motion` respected (existing patterns).

## Docs

Update `AGENTS.md` / `CLAUDE.md` / `README.md` layout bullets to list new harness files and `prompts/`, and note the expanded result fields.

## Verification

- `pnpm run build`
- Manual: wellness task approve path shows duration, prompt versions, round history, dynamics; medical task still gates; approve still writes `data/output.md` only.
- Prompt swap check: creating `healthCoach.v2.md` + `ACTIVE_PROMPTS.coach = "v2"` changes coach instructions without other code edits (manual / optional).

## Error handling

- Missing prompt file: throw clear error at agent construction or first load.
- Invalid reviewer JSON after retry: throw (same as today).
- Missing/empty `CURSOR_API_KEY`: existing errors unchanged.
