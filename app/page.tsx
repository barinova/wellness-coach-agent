"use client";

import { FormEvent, KeyboardEvent, useRef, useState } from "react";
import {
  ArrowUp,
  CircleCheck,
  Clock3,
  GitBranch,
  History,
  Loader2,
  OctagonAlert,
  RotateCcw,
  TrendingUp,
  TriangleAlert,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Kbd } from "@/components/ui/kbd";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

type Review = {
  verdict: "approve" | "revise" | "needs_human_professional";
  score: number;
  issues: string[];
};

type ToolCallInfo = {
  name: string;
  detail?: string;
};

type RoundState = {
  round: number;
  plan: string;
  review: Review;
  toolCalls?: ToolCallInfo[];
};

type AgentResult = {
  plan: string;
  review: Review;
  rounds: RoundState[];
  finalScore: number | null;
  improved: boolean;
  promptVersions: { coach: string; reviewer: string };
  durationMs: number;
  toolCalls: Array<string | ToolCallInfo>;
};

function normalizeToolCall(call: string | ToolCallInfo): ToolCallInfo {
  return typeof call === "string" ? { name: call } : call;
}

function ToolCallList({ calls }: { calls: Array<string | ToolCallInfo> }) {
  if (calls.length === 0) {
    return <p className="text-sm text-muted-foreground">No tools used</p>;
  }
  return (
    <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm marker:text-muted-foreground">
      {calls.map((raw, index) => {
        const call = normalizeToolCall(raw);
        return (
          <li key={`${call.name}-${index}`} className="font-mono text-[0.8125rem]">
            <span>{call.name}</span>
            {call.detail ? (
              <span className="ml-2 font-sans text-muted-foreground">({call.detail})</span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

type UiState = "idle" | "running" | "result";

const MAX_ROUNDS = 3;

const VERDICT: Record<
  Review["verdict"],
  { label: string; badge: string; icon: typeof CircleCheck }
> = {
  approve: { label: "Approved", badge: "bg-success text-success-foreground", icon: CircleCheck },
  revise: { label: "Needs revision", badge: "bg-warning text-warning-foreground", icon: RotateCcw },
  needs_human_professional: {
    label: "Specialist required",
    badge: "bg-warning text-warning-foreground",
    icon: TriangleAlert,
  },
};

function formatDuration(ms: number) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  return `${seconds} s`;
}

export default function HomePage() {
  const [task, setTask] = useState("");
  const [state, setState] = useState<UiState>("idle");
  const [result, setResult] = useState<AgentResult | null>(null);
  const [error, setError] = useState("");
  const errorRef = useRef<HTMLParagraphElement>(null);
  const taskId = "task";
  const hintId = "task-hint";
  const errorId = "task-error";

  async function runAgent() {
    const nextTask = task.trim();
    if (state === "running") return;
    if (!nextTask) {
      setError("Enter a task before running the agent.");
      requestAnimationFrame(() => errorRef.current?.focus());
      return;
    }
    setError("");
    setResult(null);
    setState("running");
    try {
      const response = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: nextTask }),
      });
      const raw = (await response.text()).trim();
      const jsonText = raw.replace(/^\s*\n+/, "");
      if (!jsonText || jsonText.startsWith("<!") || jsonText.startsWith("<html")) {
        const missingPrompt = raw.match(/Missing prompt file: prompts\/[^"'<\s]+/);
        throw new Error(
          missingPrompt
            ? `${missingPrompt[0]}. Create that file or set ACTIVE_PROMPTS back to an existing version, then restart pnpm run dev.`
            : `Agent API returned HTML (${response.status}). Check the terminal running pnpm run dev and restart it after prompt changes.`,
        );
      }
      let data: AgentResult & { error?: string };
      try {
        data = JSON.parse(jsonText) as AgentResult & { error?: string };
      } catch {
        throw new Error("Agent API returned a non-JSON response. Restart pnpm run dev and try again.");
      }
      if (!response.ok || data.error) throw new Error(data.error ?? "Request failed");
      setResult(data);
      setState("result");
    } catch (err) {
      const network =
        err instanceof TypeError ||
        (err instanceof Error && /fetch|network|load failed/i.test(err.message));
      setError(
        network
          ? "Can't reach the agent. Use http://localhost:3000 with `pnpm run dev` running, and don't reload while a run is in progress (it can take a few minutes)."
          : err instanceof Error
            ? err.message
            : "Request failed",
      );
      setState("idle");
      requestAnimationFrame(() => errorRef.current?.focus());
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runAgent();
  }

  function onTaskKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void runAgent();
    }
  }

  const running = state === "running";
  const verdict = result ? VERDICT[result.review.verdict] : null;
  const needsSpecialist = result?.review.verdict === "needs_human_professional";
  const describedBy = error ? `${hintId} ${errorId}` : hintId;
  const roundCount = result?.rounds.length ?? 0;
  const displayScore = result ? (result.finalScore ?? result.review.score) : 0;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-10 sm:py-16">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium tracking-wide text-muted-foreground uppercase">
          Local coaching loop
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-balance">Health Coach Agent</h1>
        <p className="max-w-xl text-muted-foreground text-pretty">
          Describe a health or wellness task. The coach drafts a plan, then a safety reviewer
          checks it before anything is saved.
        </p>
      </header>

      <Card>
        <CardContent>
          <form className="flex flex-col gap-5" onSubmit={onSubmit} aria-busy={running}>
            <div className="flex flex-col gap-2">
              <Label htmlFor={taskId} className="text-base font-bold">
                Task
              </Label>
              <p className="text-sm text-muted-foreground" id={hintId}>
                Be specific about the goal, constraints, and who the plan is for.
              </p>
              <Textarea
                id={taskId}
                name="task"
                value={task}
                onChange={(e) => setTask(e.target.value)}
                onKeyDown={onTaskKeyDown}
                rows={5}
                className="min-h-32 text-base"
                placeholder="Example: 20-minute mobility routine for a desk day, no equipment"
                disabled={running}
                aria-invalid={Boolean(error)}
                aria-describedby={describedBy}
              />
              {error ? (
                <p
                  ref={errorRef}
                  id={errorId}
                  role="alert"
                  tabIndex={-1}
                  className="flex items-center gap-2 text-sm font-medium text-destructive"
                >
                  <OctagonAlert className="size-4 shrink-0" aria-hidden="true" />
                  {error}
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
              <Button type="submit" size="lg" className="min-h-11 min-w-11 px-4" disabled={running}>
                {running ? (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                ) : (
                  <ArrowUp aria-hidden="true" />
                )}
                {running ? "Running…" : "Run agent"}
              </Button>
              {running ? (
                <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
                  Reviewing the draft. This can take a minute.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  <Kbd>⌘</Kbd> <Kbd>Enter</Kbd> or <Kbd>Ctrl</Kbd> <Kbd>Enter</Kbd> to run
                </p>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {running ? (
        <div className="flex flex-col gap-3" aria-hidden="true">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : null}

      {state === "result" && result && verdict ? (
        <section className="flex flex-col gap-6" aria-label="Result">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-lg">Safety review</CardTitle>
                <Badge className={`h-7 px-3 text-sm ${verdict.badge}`}>
                  <verdict.icon aria-hidden="true" />
                  {verdict.label}
                </Badge>
              </div>
              <CardDescription>
                {result.review.verdict === "approve"
                  ? "Coach → reviewer. Reviewed and saved to data/output.md."
                  : needsSpecialist
                    ? "Coach → reviewer. A self-serve plan was blocked."
                    : `Coach → reviewer. Not approved after ${roundCount} ${roundCount === 1 ? "round" : "rounds"}. data/output.md was not updated.`}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Safety score
                  </p>
                  <p className="text-2xl font-bold tabular-nums">
                    {displayScore}
                    <span className="text-base font-normal text-muted-foreground"> / 10</span>
                  </p>
                </div>
                <Progress
                  value={displayScore * 10}
                  aria-label={`Safety score ${displayScore} out of 10`}
                  className="h-2.5"
                />
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Review rounds
                  </p>
                  <p className="text-sm font-semibold tabular-nums">
                    {roundCount}/{MAX_ROUNDS}
                  </p>
                </div>
                <div
                  className="flex gap-2"
                  role="img"
                  aria-label={`${roundCount} of ${MAX_ROUNDS} rounds`}
                >
                  {Array.from({ length: MAX_ROUNDS }, (_, index) => (
                    <span
                      key={index}
                      className={`size-2.5 rounded-full ${
                        index < roundCount ? "bg-foreground" : "bg-muted-foreground/25"
                      }`}
                      aria-hidden="true"
                    />
                  ))}
                </div>
              </div>

              <ul className="flex flex-col gap-3 text-sm">
                <li className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Clock3 className="size-4 shrink-0" aria-hidden="true" />
                    Time
                  </span>
                  <span className="font-medium tabular-nums">{formatDuration(result.durationMs)}</span>
                </li>
                <li className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <GitBranch className="size-4 shrink-0" aria-hidden="true" />
                    Prompts
                  </span>
                  <span className="font-medium text-right">
                    coach {result.promptVersions.coach} / reviewer {result.promptVersions.reviewer}
                  </span>
                </li>
                <li className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <TrendingUp className="size-4 shrink-0" aria-hidden="true" />
                    Dynamics
                  </span>
                  <span className="font-medium">
                    {result.improved ? "Score improved" : "No score growth"}
                  </span>
                </li>
              </ul>

              <details
                className="group rounded-lg border border-border bg-muted/40 open:bg-muted/60"
                open
              >
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-medium marker:content-none [&::-webkit-details-marker]:hidden">
                  <span className="flex items-center gap-2">
                    <History className="size-4 shrink-0" aria-hidden="true" />
                    Round history
                  </span>
                  <span className="tabular-nums text-muted-foreground">{roundCount}</span>
                </summary>
                <ul className="flex flex-col gap-2 border-t border-border px-3 py-3">
                  {result.rounds.map((round) => {
                    const roundVerdict = VERDICT[round.review.verdict];
                    return (
                      <li
                        key={round.round}
                        className="flex flex-col gap-2 rounded-md bg-background px-3 py-2.5 text-sm"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium">Round {round.round}</span>
                          <span className="flex flex-wrap items-center gap-2">
                            <Badge className={`h-6 px-2 text-xs ${roundVerdict.badge}`}>
                              <roundVerdict.icon aria-hidden="true" />
                              {roundVerdict.label}
                            </Badge>
                            <span className="tabular-nums text-muted-foreground">
                              score {round.review.score}/10
                            </span>
                          </span>
                        </div>
                        <ToolCallList calls={round.toolCalls ?? []} />
                      </li>
                    );
                  })}
                </ul>
              </details>

              <div className="flex flex-col gap-2">
                <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Remarks
                </h3>
                {result.review.issues.length > 0 ? (
                  <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm marker:text-muted-foreground">
                    {result.review.issues.map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CircleCheck className="size-4 shrink-0 text-success" aria-hidden="true" />
                    No issues
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {needsSpecialist ? (
            <Alert className="border-warning/50">
              <TriangleAlert aria-hidden="true" className="text-warning" />
              <AlertTitle>This request needs a specialist consultation</AlertTitle>
              <AlertDescription>
                The coach does not cover medications, diagnoses, treatment, or symptoms. Please
                talk to a qualified professional.
              </AlertDescription>
            </Alert>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Plan</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap [overflow-wrap:anywhere] leading-relaxed">
                  {result.plan}
                </p>
              </CardContent>
            </Card>
          )}
        </section>
      ) : null}
    </main>
  );
}
