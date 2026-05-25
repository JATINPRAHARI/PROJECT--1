import { BundleSchema, validateStrict } from "../schemas.mjs";
import { validateCrossLayer } from "../validate-cross-layer.mjs";

export function repairBundle(bundle) {
  const repairsApplied = [];
  const failureTypes = [];

  // 1) Schema-level strict validation repair: ensure required top-level defaults.
  if (bundle?.version !== 1) {
    bundle.version = 1;
    repairsApplied.push("bundle.version set to 1");
    failureTypes.push("missing_keys");
  }
  bundle.diagnostics ??= { validationErrors: [], repairsApplied: [], failureTypes: [] };
  bundle.diagnostics.validationErrors ??= [];
  bundle.diagnostics.repairsApplied ??= [];
  bundle.diagnostics.failureTypes ??= [];

  // 2) Cross-layer targeted repairs
  const crossErrors = validateCrossLayer(bundle);
  if (crossErrors.length) {
    failureTypes.push("schema_mismatch");
    bundle.diagnostics.validationErrors.push(...crossErrors);

    const entities = new Set(bundle.schema.db.entities.map((e) => e.name));
    // Drop screens referencing missing entities.
    bundle.schema.ui.screens = bundle.schema.ui.screens.map((s) => {
      if (s.entity && !entities.has(s.entity)) {
        repairsApplied.push(`ui.screen.${s.id}.entity cleared (missing entity)`);
        return { ...s, entity: undefined, fields: [], submitToApi: undefined };
      }
      return s;
    });

    // Drop api endpoints referencing missing entities.
    bundle.schema.api.endpoints = bundle.schema.api.endpoints.filter((ep) => {
      if (ep.entity && !entities.has(ep.entity)) {
        repairsApplied.push(`api.endpoint.${ep.id} removed (missing entity)`);
        return false;
      }
      return true;
    });

    // Ensure auth.defaultRole is valid.
    const roleSet = new Set(bundle.schema.auth.roles);
    if (!roleSet.has(bundle.schema.auth.defaultRole)) {
      const first = bundle.schema.auth.roles[0] ?? "admin";
      repairsApplied.push(`auth.defaultRole set to '${first}'`);
      bundle.schema.auth.defaultRole = first;
    }
  }

  // 3) Re-validate strictly; if still invalid, surface errors (do not loop forever).
  const validated = validateStrict(BundleSchema, bundle);
  if (!validated.ok) {
    failureTypes.push("invalid_json_or_schema");
    return { ok: false, bundle, repairsApplied, errors: validated.errors, failureTypes };
  }
  return { ok: true, bundle: validated.value, repairsApplied, errors: [], failureTypes };
}

