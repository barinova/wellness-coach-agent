"use client";

import { FormEvent, KeyboardEvent, useRef, useState } from "react";
import { ArrowUp, CircleCheck, Loader2, OctagonAlert, RotateCcw, TriangleAlert } from "lucide-react";
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

type AgentResult = {
  plan: string;
  review: Review;
  rounds: number;
};

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
      const data = JSON.parse((await response.text()).trim() || "{}") as AgentResult & {
        error?: string;
      };
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
                  ? "Reviewed and saved to data/output.md."
                  : needsSpecialist
                    ? "A self-serve plan was blocked. The notes below explain why."
                    : `Not approved after ${result.rounds} ${result.rounds === 1 ? "round" : "rounds"}. data/output.md was not updated.`}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <dl className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <dt className="text-sm text-muted-foreground">Score</dt>
                  <dd className="flex flex-col gap-2">
                    <span className="text-2xl font-bold tabular-nums">
                      {result.review.score}
                      <span className="text-base font-normal text-muted-foreground"> / 10</span>
                    </span>
                    <Progress
                      value={result.review.score * 10}
                      aria-label={`Score ${result.review.score} out of 10`}
                    />
                  </dd>
                </div>
                <div className="flex flex-col gap-2">
                  <dt className="text-sm text-muted-foreground">Review rounds</dt>
                  <dd className="flex flex-col gap-2">
                    <span className="text-2xl font-bold tabular-nums">
                      {result.rounds}
                      <span className="text-base font-normal text-muted-foreground">
                        {` / ${MAX_ROUNDS}`}
                      </span>
                    </span>
                    <Progress
                      value={(result.rounds / MAX_ROUNDS) * 100}
                      aria-label={`${result.rounds} of ${MAX_ROUNDS} rounds`}
                    />
                  </dd>
                </div>
              </dl>

              {result.review.issues.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <h3 className="text-sm font-bold">
                    Reviewer notes ({result.review.issues.length})
                  </h3>
                  <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm marker:text-muted-foreground">
                    {result.review.issues.map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No issues recorded.</p>
              )}
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
