import { runHealthAgent } from "../../../../src/harness/runHealthAgent";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 5_000;

function streamJson(work: () => Promise<unknown>) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode("\n"));
        } catch {
          clearInterval(heartbeat);
        }
      }, HEARTBEAT_MS);

      const finish = (chunk: string) => {
        clearInterval(heartbeat);
        controller.enqueue(encoder.encode(chunk));
        controller.close();
      };

      work()
        .then((value) => finish(JSON.stringify(value)))
        .catch((err) => {
          const message = err instanceof Error ? err.message : "Agent failed";
          finish(JSON.stringify({ error: message }));
        });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const task = typeof body?.task === "string" ? body.task.trim() : "";
  if (!task) {
    return Response.json({ error: "task is required" }, { status: 400 });
  }
  return streamJson(() => runHealthAgent(task));
}
