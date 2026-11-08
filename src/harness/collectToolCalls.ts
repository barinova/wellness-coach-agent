export type ToolCallInfo = {
  name: string;
  /** Short UI detail, e.g. "days=7 → 4 log days". */
  detail?: string;
};

function parseArgs(raw: unknown): Record<string, unknown> | undefined {
  if (raw == null) return undefined;
  if (typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw !== "string") return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // ignore
  }
  return undefined;
}

function outputText(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) {
    return raw.map((part) => outputText(part)).filter(Boolean).join("\n");
  }
  if (!raw || typeof raw !== "object") return "";
  const row = raw as { output?: unknown; result?: unknown; text?: unknown; type?: string };
  if (typeof row.text === "string") return row.text;
  const out = row.output ?? row.result;
  if (typeof out === "string") return out;
  if (out && typeof out === "object") return outputText(out);
  return "";
}

export function countLogDays(markdown: string): number {
  return (markdown.match(/^##\s+\d{4}-\d{2}-\d{2}\b/gm) ?? []).length;
}

/** Prefer the stable first line from formatRecentLog; fall back to heading count. */
export function parseLogFetchDetail(
  args: Record<string, unknown> | undefined,
  output: string,
): string | undefined {
  const meta = output.match(/Fetched\s+(\d+)\s+of\s+(\d+)\s+requested log day/i);
  if (meta) {
    const returned = Number(meta[1]);
    const requested = Number(meta[2]);
    return `days=${requested} → ${returned} log day${returned === 1 ? "" : "s"}`;
  }

  const requestedRaw = typeof args?.days === "number" ? args.days : Number(args?.days);
  const returned = countLogDays(output);
  if (Number.isFinite(requestedRaw) && returned > 0) {
    return `days=${requestedRaw} → ${returned} log day${returned === 1 ? "" : "s"}`;
  }
  if (Number.isFinite(requestedRaw)) return `days=${requestedRaw}`;
  if (returned > 0) return `returned ${returned} log day${returned === 1 ? "" : "s"}`;
  return undefined;
}

function detailFor(
  name: string,
  args: Record<string, unknown> | undefined,
  output: string,
): string | undefined {
  if (name === "getRecentLog") return parseLogFetchDetail(args, output);
  return undefined;
}

/** Pull ordered tool calls (with getRecentLog day detail) from an Agents SDK run result. */
export function collectToolCalls(result: { newItems?: ReadonlyArray<unknown> }): ToolCallInfo[] {
  const items = result.newItems ?? [];
  const names: ToolCallInfo[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item || typeof item !== "object") continue;
    const row = item as { type?: string; rawItem?: unknown };
    if (row.type !== "tool_call_item") continue;
    const raw = row.rawItem;
    if (!raw || typeof raw !== "object") continue;
    const call = raw as { type?: string; name?: string; arguments?: unknown; callId?: string };
    if (call.type !== "function_call" || !call.name) continue;

    const args = parseArgs(call.arguments);
    let output = "";
    for (let j = 0; j < items.length; j++) {
      if (j === i) continue;
      const next = items[j];
      if (!next || typeof next !== "object") continue;
      const nextRow = next as { type?: string; rawItem?: unknown; output?: unknown };
      if (nextRow.type !== "tool_call_output_item") continue;
      const outRaw = nextRow.rawItem;
      if (call.callId && outRaw && typeof outRaw === "object") {
        const outCall = outRaw as { callId?: string };
        if (outCall.callId && outCall.callId !== call.callId) continue;
      } else if (call.callId && j < i) {
        continue;
      }
      output =
        (typeof nextRow.output === "string" ? nextRow.output : "") ||
        outputText(outRaw) ||
        outputText(nextRow.output);
      if (output) break;
    }

    names.push({
      name: call.name,
      detail: detailFor(call.name, args, output),
    });
  }
  return names;
}

export function toolNames(calls: ToolCallInfo[]): string[] {
  return calls.map((c) => c.name);
}

export function hasTool(calls: ToolCallInfo[], name: string): boolean {
  return calls.some((c) => c.name === name);
}
