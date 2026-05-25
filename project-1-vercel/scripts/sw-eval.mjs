import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { spawnSync } from "node:child_process";

function readJson(p) {
  return JSON.parse(readFileSync(p, "utf8"));
}

const dataset = readJson("eval/dataset.json");
const prompts = [
  ...dataset.real_prompts.map((p) => ({ kind: "real", prompt: p })),
  ...dataset.edge_cases.map((p) => ({ kind: "edge", prompt: p })),
];

mkdirSync("eval/out", { recursive: true });

const results = [];
for (let i = 0; i < prompts.length; i++) {
  const item = prompts[i];
  const outDir = path.join("eval/out", `${String(i).padStart(2, "0")}`);
  const start = performance.now();
  const r = spawnSync("node", ["scripts/sw-compile.mjs", "--prompt", item.prompt, "--out", outDir, "--pretty"], {
    encoding: "utf8",
  });
  const end = performance.now();
  const ok = r.status === 0;
  results.push({
    index: i,
    kind: item.kind,
    ok,
    status: r.status,
    latencyMs: Math.round(end - start),
    outDir,
    stderr: (r.stderr || "").slice(0, 2000),
  });
}

const summary = {
  total: results.length,
  ok: results.filter((r) => r.ok).length,
  successRate: results.length ? results.filter((r) => r.ok).length / results.length : 0,
  avgLatencyMs: results.length ? Math.round(results.reduce((a, r) => a + r.latencyMs, 0) / results.length) : 0,
  failureTypes: {},
};

// Pull failure types from summary.json when available
for (const r of results) {
  try {
    const s = readJson(path.join(r.outDir, "summary.json"));
    for (const ft of s.diagnostics.failureTypes || []) summary.failureTypes[ft] = (summary.failureTypes[ft] || 0) + 1;
  } catch {
    summary.failureTypes.compile_failed = (summary.failureTypes.compile_failed || 0) + 1;
  }
}

writeFileSync("eval/results.json", JSON.stringify({ summary, results }, null, 2), "utf8");
console.log(JSON.stringify(summary, null, 2));
