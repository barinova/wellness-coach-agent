import { readFileSync } from "node:fs";
import { Agent as CursorAgent } from "@cursor/sdk";
import { setDefaultOpenAIClient, setOpenAIAPI, setTracingDisabled } from "@openai/agents";
import OpenAI from "openai";

const MODEL = "composer-2.5";

type ChatMessage = {
  role?: string;
  content?: unknown;
  name?: string;
  tool_call_id?: string;
  tool_calls?: unknown;
};

type OpenAITool = {
  type?: string;
  function?: { name?: string; description?: string; parameters?: unknown };
};

function apiKeyFromEnvFile() {
  let raw = "";
  try {
    raw = readFileSync(".env", "utf8");
  } catch {
    throw new Error("Missing .env. Copy .env.example and set CURSOR_API_KEY.");
  }
  const line = raw
    .split(/\r?\n/)
    .find((row) => /^\s*CURSOR_API_KEY\s*=/.test(row) && !row.trim().startsWith("#"));
  const value =
    line?.replace(/^\s*CURSOR_API_KEY\s*=\s*/, "").replace(/^["']|["']$/g, "").trim() ?? "";
  if (!value) throw new Error("CURSOR_API_KEY in .env is empty.");
  return value;
}

function contentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) {
          return String((part as { text?: unknown }).text ?? "");
        }
        return JSON.stringify(part);
      })
      .join("");
  }
  if (content == null) return "";
  return JSON.stringify(content);
}

function formatMessages(messages: ChatMessage[]): string {
  return messages
    .map((m) => {
      const role = m.role ?? "user";
      const bits: string[] = [`${role}:`];
      if (m.name) bits.push(`name=${m.name}`);
      if (m.tool_call_id) bits.push(`tool_call_id=${m.tool_call_id}`);
      if (m.tool_calls) bits.push(`tool_calls=${JSON.stringify(m.tool_calls)}`);
      const text = contentToText(m.content);
      if (text) bits.push(text);
      return bits.join(" ");
    })
    .join("\n\n");
}

function formatTools(tools: OpenAITool[]): string {
  return tools
    .map((t, i) => {
      const fn = t.function ?? {};
      return [
        `Tool ${i + 1}: ${fn.name ?? "unknown"}`,
        `Description: ${fn.description ?? ""}`,
        `Parameters JSON schema: ${JSON.stringify(fn.parameters ?? {})}`,
      ].join("\n");
    })
    .join("\n\n");
}

const TOOL_PROTOCOL = `You may call tools. Reply with ONE of:
1) Final answer as plain text (no JSON wrapper), OR
2) Exactly one JSON object (no markdown fences) of the form:
{"tool_calls":[{"id":"call_1","name":"TOOL_NAME","arguments":{...}}]}
You may include multiple objects in tool_calls if you need several tools at once.
Do not invent tool names. Arguments must match the tool schema.`;

type ParsedToolCall = { id: string; name: string; arguments: string };

function tryParseToolCalls(raw: string): ParsedToolCall[] | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const candidates: string[] = [trimmed];
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) candidates.push(fenced[1].trim());
  const brace = trimmed.match(/\{[\s\S]*"tool_calls"[\s\S]*\}/);
  if (brace?.[0]) candidates.push(brace[0]);

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as {
        tool_calls?: Array<{ id?: string; name?: string; arguments?: unknown }>;
      };
      if (!Array.isArray(parsed.tool_calls) || parsed.tool_calls.length === 0) continue;
      const calls: ParsedToolCall[] = [];
      for (const [index, call] of parsed.tool_calls.entries()) {
        if (!call?.name) continue;
        const args =
          typeof call.arguments === "string"
            ? call.arguments
            : JSON.stringify(call.arguments ?? {});
        calls.push({
          id: call.id?.trim() || `call_${index + 1}`,
          name: call.name,
          arguments: args,
        });
      }
      if (calls.length > 0) return calls;
    } catch {
      // try next candidate
    }
  }
  return null;
}

function completionResponse(
  id: string,
  message: Record<string, unknown>,
  finishReason: string,
): Response {
  return new Response(
    JSON.stringify({
      id,
      object: "chat.completion",
      choices: [{ index: 0, message, finish_reason: finishReason }],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    }),
    { headers: { "Content-Type": "application/json" } },
  );
}

let clientReady = false;

/** Wires Agents SDK chat_completions to CursorAgent.prompt, including a text↔tool_calls bridge. */
export function ensureCursorOpenAIClient() {
  if (clientReady) return;
  const apiKey = apiKeyFromEnvFile();
  setTracingDisabled(true);
  setOpenAIAPI("chat_completions");
  setDefaultOpenAIClient(
    new OpenAI({
      apiKey,
      baseURL: "http://127.0.0.1/v1",
      fetch: async (_url, init) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          messages?: ChatMessage[];
          tools?: OpenAITool[];
        };
        const messages = body.messages ?? [];
        const tools = (body.tools ?? []).filter((t) => t.function?.name);

        let prompt =
          "Do not read or write files, do not run commands. Reply with text only (or the tool JSON protocol below if tools are listed).\n\n" +
          formatMessages(messages);

        if (tools.length > 0) {
          prompt += `\n\nAvailable tools:\n${formatTools(tools)}\n\n${TOOL_PROTOCOL}`;
        }

        const result = await CursorAgent.prompt(prompt, {
          apiKey,
          model: { id: MODEL, params: [{ id: "fast", value: "false" }] },
          local: { cwd: process.cwd(), settingSources: [] },
        });
        if (result.status === "error") throw new Error(`Cursor run failed (${result.id})`);

        const text = String(result.result ?? "").trim();
        const id = result.id ?? "cursor";

        if (tools.length > 0) {
          const calls = tryParseToolCalls(text);
          if (calls) {
            return completionResponse(
              id,
              {
                role: "assistant",
                content: null,
                tool_calls: calls.map((c) => ({
                  id: c.id,
                  type: "function",
                  function: { name: c.name, arguments: c.arguments },
                })),
              },
              "tool_calls",
            );
          }
        }

        return completionResponse(id, { role: "assistant", content: text }, "stop");
      },
    }),
  );
  clientReady = true;
}
