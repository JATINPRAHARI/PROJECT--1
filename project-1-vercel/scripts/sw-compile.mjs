import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { BundleSchema, validateStrict } from "../compiler/schemas.mjs";
import { stageIntentExtraction } from "../compiler/stages/intent.mjs";
import { stageSystemDesign } from "../compiler/stages/design.mjs";
import { stageSchemaGeneration } from "../compiler/stages/schema-gen.mjs";
import { stageRefinement } from "../compiler/stages/refine.mjs";
import { validateCrossLayer } from "../compiler/validate-cross-layer.mjs";
import { repairBundle } from "../compiler/repair/repair.mjs";

function parseArgs(argv) {
  const args = { prompt: "", out: "dist/compiler", pretty: false, deterministic: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--prompt") args.prompt = argv[++i] ?? "";
    else if (a === "--out") args.out = argv[++i] ?? args.out;
    else if (a === "--pretty") args.pretty = true;
    else if (a === "--deterministic") args.deterministic = true;
  }
  return args;
}

const { prompt, out, pretty, deterministic } = parseArgs(process.argv);
if (!prompt) {
  console.error(
    "Usage: node scripts/sw-compile.mjs --prompt \"...\" [--out dist/compiler] [--pretty] [--deterministic]",
  );
  process.exit(1);
}

const intentRes = stageIntentExtraction(prompt);
if (!intentRes.ok) {
  console.error("Intent extraction failed:");
  console.error(intentRes.errors.join("\n"));
  process.exit(2);
}

const designRes = stageSystemDesign(intentRes.intent);
if (!designRes.ok) {
  console.error("System design failed:");
  console.error(designRes.errors.join("\n"));
  process.exit(3);
}

const schemaRes = stageSchemaGeneration(designRes.design);
if (!schemaRes.ok) {
  console.error("Schema generation failed:");
  console.error(schemaRes.errors.join("\n"));
  process.exit(4);
}

const refineRes = stageRefinement(schemaRes.schema);
if (!refineRes.ok) {
  console.error("Refinement failed:");
  console.error(refineRes.errors.join("\n"));
  process.exit(5);
}

let bundle = {
  version: 1,
  createdAt: deterministic ? "1970-01-01T00:00:00.000Z" : new Date().toISOString(),
  intent: intentRes.intent,
  design: designRes.design,
  schema: refineRes.schema,
  diagnostics: { validationErrors: [], repairsApplied: [...refineRes.repairsApplied], failureTypes: [] },
};

const crossErrors = validateCrossLayer(bundle);
bundle.diagnostics.validationErrors.push(...crossErrors);

const repaired = repairBundle(bundle);
bundle.diagnostics.repairsApplied.push(...repaired.repairsApplied);
bundle.diagnostics.failureTypes.push(...repaired.failureTypes);
if (!repaired.ok) {
  bundle.diagnostics.validationErrors.push(...repaired.errors);
}

const finalValidation = validateStrict(BundleSchema, bundle);
if (!finalValidation.ok) {
  console.error("Final bundle invalid:");
  console.error(finalValidation.errors.join("\n"));
  process.exit(6);
}

mkdirSync(out, { recursive: true });
const bundlePath = path.join(out, "bundle.json");
writeFileSync(bundlePath, JSON.stringify(finalValidation.value, null, pretty ? 2 : 0), "utf8");

const summaryPath = path.join(out, "summary.json");
writeFileSync(
  summaryPath,
  JSON.stringify(
    {
      productName: finalValidation.value.intent.productName,
      roles: finalValidation.value.schema.auth.roles,
      entities: finalValidation.value.schema.db.entities.map((e) => ({ name: e.name, fields: e.fields.map((f) => f.name) })),
      screens: finalValidation.value.schema.ui.screens.map((s) => ({ id: s.id, kind: s.kind, entity: s.entity ?? null })),
      endpoints: finalValidation.value.schema.api.endpoints.map((e) => ({ id: e.id, method: e.method, path: e.path })),
      diagnostics: finalValidation.value.diagnostics,
      clarificationQuestions: finalValidation.value.schema.clarificationQuestions,
      assumptions: finalValidation.value.schema.assumptions,
    },
    null,
    2,
  ),
  "utf8",
);

process.stdout.write(bundlePath);
