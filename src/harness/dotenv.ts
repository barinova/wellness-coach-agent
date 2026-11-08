import { readFileSync } from "node:fs";

/** Read a single key from `.env` in cwd (fresh each call; no process cache). */
export function readDotEnv(key: string): string {
  let raw = "";
  try {
    raw = readFileSync(".env", "utf8");
  } catch {
    return "";
  }
  const line = raw
    .split(/\r?\n/)
    .find((row) => new RegExp(`^\\s*${key}\\s*=`).test(row) && !row.trim().startsWith("#"));
  return (
    line?.replace(new RegExp(`^\\s*${key}\\s*=\\s*`), "").replace(/^["']|["']$/g, "").trim() ?? ""
  );
}
