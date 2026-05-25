import { mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";

function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
}

const workspaceHome = path.join(process.cwd(), ".devhome");
const wranglerHome = path.join(process.cwd(), ".wrangler");

ensureDir(workspaceHome);
ensureDir(wranglerHome);

process.env.WRANGLER_HOME ??= wranglerHome;
process.env.XDG_CONFIG_HOME ??= path.join(workspaceHome, "xdg.config");
process.env.XDG_CACHE_HOME ??= path.join(workspaceHome, "xdg.cache");

ensureDir(process.env.XDG_CONFIG_HOME);
ensureDir(process.env.XDG_CACHE_HOME);

const [viteCommand, ...viteArgs] = process.argv.slice(2);
if (!viteCommand) {
  console.error("Usage: node scripts/run-vite.mjs <dev|build|preview> [...args]");
  process.exit(1);
}

const viteBin =
  process.platform === "win32"
    ? path.join(process.cwd(), "node_modules", ".bin", "vite.cmd")
    : path.join(process.cwd(), "node_modules", ".bin", "vite");

const child = spawn(viteBin, [viteCommand, ...viteArgs], {
  stdio: "inherit",
  env: process.env,
  shell: process.platform === "win32",
});

child.on("exit", (code, signal) => {
  if (signal) process.exit(1);
  process.exit(code ?? 1);
});
