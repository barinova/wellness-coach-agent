const ua = process.env.npm_config_user_agent ?? "";
if (!ua.includes("pnpm")) {
  console.error("This project uses pnpm only. Use: pnpm install / pnpm run <script>");
  process.exit(1);
}
