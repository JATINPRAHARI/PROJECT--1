import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { BundleSchema, validateStrict } from "../compiler/schemas.mjs";
import { parsePatch } from "../compiler/patch/parse-patch.mjs";
import { applyPatchToBundle } from "../compiler/patch/apply-patch.mjs";

function parseArgs(argv) {
  const args = {
    bundle: "dist/compiler/bundle.json",
    patch: "",
    out: "dist/compiler",
    pretty: false,
    deterministic: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--bundle") args.bundle = argv[++i] ?? args.bundle;
    else if (a === "--patch") args.patch = argv[++i] ?? "";
    else if (a === "--out") args.out = argv[++i] ?? args.out;
    else if (a === "--pretty") args.pretty = true;
    else if (a === "--deterministic") args.deterministic = true;
  }
  return args;
}

const { bundle: bundlePath, patch: patchText, out, pretty, deterministic } = parseArgs(process.argv);
if (!patchText) {
  console.error(
    "Usage: node scripts/sw-patch.mjs --bundle dist/compiler/bundle.json --patch \"add entity invoice fields: number, amount:number\" [--out dist/compiler] [--pretty] [--deterministic]",
  );
  process.exit(1);
}

let bundleRaw;
try {
  bundleRaw = JSON.parse(readFileSync(bundlePath, "utf8"));
} catch (e) {
  console.error("Bundle is not valid JSON:", e?.message ?? e);
  process.exit(2);
}

const bundleValidated = validateStrict(BundleSchema, bundleRaw);
if (!bundleValidated.ok) {
  console.error("Bundle failed schema validation:\n" + bundleValidated.errors.join("\n"));
  process.exit(3);
}

const parsedPatch = parsePatch(patchText);
if (!parsedPatch.ok) {
  console.error("Patch parse failed:\n" + parsedPatch.errors.join("\n"));
  process.exit(4);
}

const nextBundle = structuredClone(bundleValidated.value);
nextBundle.createdAt = deterministic ? "1970-01-01T00:00:00.000Z" : new Date().toISOString();

const applied = applyPatchToBundle(nextBundle, parsedPatch.patch);
if (!applied.ok) {
  console.error("Patch apply failed:\n" + applied.errors.join("\n"));
  process.exit(5);
}

mkdirSync(out, { recursive: true });
const outPath = path.join(out, "bundle.json");
writeFileSync(outPath, JSON.stringify(applied.bundle, null, pretty ? 2 : 0), "utf8");

const summaryPath = path.join(out, "summary.json");
writeFileSync(
  summaryPath,
  JSON.stringify(
    {
      productName: applied.bundle.intent.productName,
      roles: applied.bundle.schema.auth.roles,
      entities: applied.bundle.schema.db.entities.map((e) => ({ name: e.name, fields: e.fields.map((f) => f.name) })),
      screens: applied.bundle.schema.ui.screens.map((s) => ({ id: s.id, kind: s.kind, entity: s.entity ?? null })),
      endpoints: applied.bundle.schema.api.endpoints.map((e) => ({ id: e.id, method: e.method, path: e.path })),
      diagnostics: applied.bundle.diagnostics,
      clarificationQuestions: applied.bundle.schema.clarificationQuestions,
      assumptions: applied.bundle.schema.assumptions,
    },
    null,
    2,
  ),
  "utf8",
);

process.stdout.write(outPath);
