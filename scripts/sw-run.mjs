import { readFileSync } from "node:fs";

import { BundleSchema, validateStrict } from "../compiler/schemas.mjs";
import { startRuntime } from "../compiler/runtime/server.mjs";

function parseArgs(argv) {
  const args = { bundle: "dist/compiler/bundle.json", port: 8787, storage: "file", dataDir: ".runtime-data" };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--bundle") args.bundle = argv[++i] ?? args.bundle;
    else if (a === "--port") args.port = Number(argv[++i] ?? args.port);
    else if (a === "--storage") args.storage = argv[++i] ?? args.storage;
    else if (a === "--dataDir") args.dataDir = argv[++i] ?? args.dataDir;
  }
  return args;
}

const { bundle: bundlePath, port, storage, dataDir } = parseArgs(process.argv);
const raw = readFileSync(bundlePath, "utf8");
let parsed;
try {
  parsed = JSON.parse(raw);
} catch (e) {
  console.error("Bundle is not valid JSON:", e?.message ?? e);
  process.exit(1);
}

const validated = validateStrict(BundleSchema, parsed);
if (!validated.ok) {
  console.error("Bundle failed schema validation:\n" + validated.errors.join("\n"));
  process.exit(2);
}

const runtime = startRuntime(validated.value, { port, storageMode: storage, dataDir });
console.log(`Runtime listening: http://127.0.0.1:${runtime.port}/ (storage=${storage})`);
