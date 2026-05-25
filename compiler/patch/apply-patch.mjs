import { stageSchemaGeneration } from "../stages/schema-gen.mjs";
import { stageRefinement } from "../stages/refine.mjs";
import { validateCrossLayer } from "../validate-cross-layer.mjs";
import { repairBundle } from "../repair/repair.mjs";
import { BundleSchema, validateStrict } from "../schemas.mjs";

function uniq(arr) {
  return Array.from(new Set(arr));
}

function ensureEntityField(design, entityName, field) {
  const entity = design.entities.find((e) => e.name === entityName);
  if (!entity) return false;
  if (entity.fields.some((f) => f.name === field.name)) return true;
  entity.fields.push({ name: field.name, type: field.type, required: !!field.required });
  return true;
}

export function applyPatchToBundle(bundle, patch) {
  const repairsApplied = [];

  for (const op of patch.ops) {
    if (op.op === "add_role") {
      bundle.intent.roles = uniq([...bundle.intent.roles, op.role]);
      bundle.design.roles = uniq([...bundle.design.roles, op.role]);
      bundle.schema.auth.roles = uniq([...bundle.schema.auth.roles, op.role]);
      repairsApplied.push(`patch:add_role ${op.role}`);
      continue;
    }

    if (op.op === "add_entity") {
      if (!bundle.intent.entities.some((e) => e.name === op.entity)) {
        bundle.intent.entities.push({ name: op.entity, fields: op.fields });
        repairsApplied.push(`patch:add_entity(intent) ${op.entity}`);
      }
      if (!bundle.design.entities.some((e) => e.name === op.entity)) {
        bundle.design.entities.push({
          name: op.entity,
          primaryKey: "id",
          fields: [{ name: "id", type: "string", required: true }, ...op.fields.map((f) => ({ ...f, required: !!f.required }))],
        });
        repairsApplied.push(`patch:add_entity(design) ${op.entity}`);
      }
      continue;
    }

    if (op.op === "remove_entity") {
      bundle.intent.entities = bundle.intent.entities.filter((e) => e.name !== op.entity);
      bundle.design.entities = bundle.design.entities.filter((e) => e.name !== op.entity);
      repairsApplied.push(`patch:remove_entity ${op.entity}`);
      continue;
    }

    if (op.op === "add_field") {
      const addedIntent = bundle.intent.entities.find((e) => e.name === op.entity);
      if (addedIntent && !addedIntent.fields.some((f) => f.name === op.field.name)) {
        addedIntent.fields.push(op.field);
        repairsApplied.push(`patch:add_field(intent) ${op.entity}.${op.field.name}`);
      }
      const ok = ensureEntityField(bundle.design, op.entity, op.field);
      if (ok) repairsApplied.push(`patch:add_field(design) ${op.entity}.${op.field.name}`);
      continue;
    }

    if (op.op === "add_screen") {
      if (!bundle.intent.screens.some((s) => s.name === op.screen.id)) {
        bundle.intent.screens.push({ name: op.screen.id, kind: op.screen.kind, entity: op.screen.entity });
        repairsApplied.push(`patch:add_screen(intent) ${op.screen.id}`);
      }
      // runtime/UI schema is regenerated below from design; we keep as a hint only.
      continue;
    }
  }

  // Re-generate schema from updated design (targeted regeneration vs full prompt re-run).
  const schemaRes = stageSchemaGeneration(bundle.design);
  if (schemaRes.ok) bundle.schema = schemaRes.schema;

  const refineRes = stageRefinement(bundle.schema);
  if (refineRes.ok) {
    bundle.schema = refineRes.schema;
    repairsApplied.push(...refineRes.repairsApplied.map((r) => `refine:${r}`));
  }

  bundle.diagnostics.validationErrors.push(...validateCrossLayer(bundle));
  const repaired = repairBundle(bundle);
  bundle.diagnostics.repairsApplied.push(...repairsApplied, ...repaired.repairsApplied);
  bundle.diagnostics.failureTypes.push(...repaired.failureTypes);

  const finalValidation = validateStrict(BundleSchema, bundle);
  if (!finalValidation.ok) {
    bundle.diagnostics.validationErrors.push(...finalValidation.errors);
    return { ok: false, bundle, repairsApplied, errors: finalValidation.errors };
  }
  return { ok: true, bundle: finalValidation.value, repairsApplied, errors: [] };
}

