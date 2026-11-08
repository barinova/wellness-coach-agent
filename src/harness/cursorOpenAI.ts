import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { Agent as CursorAgent } from "@cursor/sdk";
import { setDefaultOpenAIClient, setOpenAIAPI, setTracingDisabled } from "@openai/agents";
import OpenAI from "openai";
import { getAgentModel } from "./agentModel";
import { readDotEnv } from "./dotenv";

const require = createRequire(import.meta.url);

/** Point the Cursor SDK at its bundled `rg` before local workspace scans. */
function ensureCursorRipgrepPath() {
  const existing = process.env.CURSOR_RIPGREP_PATH;
  if (existing && existsSync(existing)) return;
  try {
    const sdkEntry = require.resolve("@cursor/sdk");
    const platName = `@cursor/sdk-${process.platform}-${process.arch}`;
    const platPkg = require.resolve(`${platName}/package.json`, {
      paths: [dirname(sdkEntry), join(dirname(sdkEntry), "..", "..")],
    });
    const rg = join(dirname(platPkg), "bin", process.platform === "win32" ? "rg.exe" : "rg");
    if (existsSync(rg)) process.env.CURSOR_RIPGREP_PATH = rg;
  } catch {
    // Optional: SDK may still resolve rg later; ignore-mapping noise is non-fatal.
  }
}

/** Model id (+ composer-only `fast` param). Other models use Cursor defaults. */
function cursorModelSelection() {
  const id = getAgentModel();
  if (id.startsWith("composer")) {
    return { id, params: [{ id: "fast", value: "false" as const }] };
  }
  return { id };
}

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
  const value = readDotEnv("CURSOR_API_KEY");
  if (!value) {
    throw new Error("Missing or empty CURSOR_API_KEY. Copy .env.example to .env and set it.");
  }
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

const TOOL_PROTOCOL = `When tools are listed and you still need profile, log, recipes, shopping, or a workout template, you MUST call tools before any final plan.
Reply with ONE of:
1) Exactly one JSON object (no markdown fences):
{"tool_calls":[{"id":"call_1","name":"TOOL_NAME","arguments":{...}}]}
You may include multiple objects in tool_calls. Do not invent tool names. Arguments must match the schema.
2) Final answer as plain text ONLY after tool results are already in this conversation (role=tool messages), or when no tool is relevant.`;

function messagesHaveToolResults(messages: ChatMessage[]): boolean {
  return messages.some((m) => m.role === "tool" || m.tool_call_id);
}

async function cursorText(apiKey: string, prompt: string): Promise<{ id: string; text: string }> {
  ensureCursorRipgrepPath();
  const result = await CursorAgent.prompt(prompt, {
    apiKey,
    model: cursorModelSelection(),
    tools: [],
    local: { cwd: process.cwd(), settingSources: [] },
  });
  if (result.status === "error") throw new Error(`Cursor run failed (${result.id})`);
  return { id: result.id ?? "cursor", text: String(result.result ?? "").trim() };
}

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

/** Wires Agents SDK chat_completions to CursorAgent.prompt, including a text↔tool_calls bridge. */
export function ensureCursorOpenAIClient() {
  const apiKey = apiKeyFromEnvFile();
  setTracingDisabled(true);
  setOpenAIAPI("chat_completions");
  // Re-bind each run so HMR picks up adapter changes (no stale fetch closure).
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
        const formatted = formatMessages(messages);
        // Harness fallback rewrite: tools already applied outside the LLM loop.
        const plainPreferred = /already fetched|Plain markdown only/i.test(formatted);

        let prompt =
          "Do not read or write files, do not run commands. Reply with text only (or the tool JSON protocol below if tools are listed).\n\n" +
          formatted;

        if (tools.length > 0) {
          prompt += `\n\nAvailable tools:\n${formatTools(tools)}\n\n${TOOL_PROTOCOL}`;
        }

        // Built-in Cursor tools would bypass coach skills; skills own side effects.
        let { id, text } = await cursorText(apiKey, prompt);

        if (tools.length > 0) {
          let calls = tryParseToolCalls(text);
          // Soft protocol: model often skips tools and writes the plan. One forced retry.
          if (!calls && !messagesHaveToolResults(messages) && !plainPreferred) {
            const retry = await cursorText(
              apiKey,
              `${prompt}\n\nYour previous reply was plain text, but tools are still unused. Reply with ONLY the tool_calls JSON object now — no plan yet.`,
            );
            id = retry.id;
            text = retry.text;
            calls = tryParseToolCalls(text);
          }
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
}
