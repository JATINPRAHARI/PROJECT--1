import { AppSchemaSchema, validateStrict } from "../schemas.mjs";

export function stageRefinement(schema) {
  const repairsApplied = [];

  // Cross-layer consistency: ensure role sets align.
  const roles = new Set(schema.auth.roles);
  schema.api.endpoints = schema.api.endpoints.map((ep) => {
    const filtered = ep.rolesAllowed.filter((r) => roles.has(r));
    if (filtered.length !== ep.rolesAllowed.length) repairsApplied.push(`api.endpoint.${ep.id}.rolesAllowed filtered`);
    return { ...ep, rolesAllowed: filtered.length ? filtered : [schema.auth.defaultRole] };
  });

  // Ensure UI submit targets exist.
  const apiIds = new Set(schema.api.endpoints.map((e) => e.id));
  schema.ui.screens = schema.ui.screens.map((s) => {
    if (s.submitToApi && !apiIds.has(s.submitToApi)) {
      repairsApplied.push(`ui.screen.${s.id}.submitToApi cleared`);
      return { ...s, submitToApi: undefined };
    }
    return s;
  });

  // Ensure entities referenced by screens exist.
  const entities = new Set(schema.db.entities.map((e) => e.name));
  schema.ui.screens = schema.ui.screens.map((s) => {
    if (s.entity && !entities.has(s.entity)) {
      repairsApplied.push(`ui.screen.${s.id}.entity cleared`);
      return { ...s, entity: undefined, fields: [] };
    }
    return s;
  });

  const validated = validateStrict(AppSchemaSchema, schema);
  return validated.ok
    ? { ok: true, schema: validated.value, repairsApplied }
    : { ok: false, schema, repairsApplied, errors: validated.errors };
}

