/** Pull ordered function-tool names from an Agents SDK run result. */
export function collectToolCalls(result: { newItems?: ReadonlyArray<unknown> }): string[] {
  const names: string[] = [];
  for (const item of result.newItems ?? []) {
    if (!item || typeof item !== "object") continue;
    const row = item as { type?: string; rawItem?: unknown };
    if (row.type !== "tool_call_item") continue;
    const raw = row.rawItem;
    if (!raw || typeof raw !== "object") continue;
    const call = raw as { type?: string; name?: string };
    if (call.type === "function_call" && call.name) names.push(call.name);
  }
  return names;
}
