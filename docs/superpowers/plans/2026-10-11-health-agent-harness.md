# Health Agent Harness Implementation Plan

> **For agentic workers:** Execute inline. No tests/TDD (repo + user forbid). No commits unless user asks.

**Goal:** Modular harness with file-backed prompts, expanded `HealthAgentResult`, mock-aligned Safety review UI.

**Architecture:** Orchestrator in `runHealthAgent.ts`; Zod/retry in `validateReview.ts`; round history in `rounds.ts`; scores in `score.ts`; prompts via `promptVersions.ts` + `prompts/*.v1.md`.

**Tech Stack:** Next.js, TypeScript, Zod, `@openai/agents`, existing shadcn/Lucide UI.

## Global Constraints

- pnpm only; no new dependencies; no tests
- Prompt text verbatim from current agents
- Only disk write: `data/output.md` on approve
- English UI matching approved mock
- Do not commit unless asked

## File map

- Create: `prompts/healthCoach.v1.md`, `prompts/safetyReviewer.v1.md`
- Create: `src/harness/promptVersions.ts`, `validateReview.ts`, `rounds.ts`, `score.ts`
- Modify: `src/harness/runHealthAgent.ts`, `src/agents/healthCoach.ts`, `src/agents/safetyReviewer.ts`
- Modify: `app/page.tsx`, `AGENTS.md`, `CLAUDE.md`, `README.md`

### Task 1: Prompts + promptVersions + validate/rounds/score + agents + orchestrator

Implement per design spec. Verify: `pnpm run build`.

### Task 2: UI mock + docs

Update result card; refresh layout docs. Verify: `pnpm run build`.
