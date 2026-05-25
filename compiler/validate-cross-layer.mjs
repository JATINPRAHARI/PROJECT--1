export function validateCrossLayer(bundle) {
  const errors = [];

  const entityFields = new Map(bundle.schema.db.entities.map((e) => [e.name, new Set(e.fields.map((f) => f.name))]));

  for (const ep of bundle.schema.api.endpoints) {
    if (!ep.entity) continue;
    const fields = entityFields.get(ep.entity);
    if (!fields) {
      errors.push(`api.endpoint.${ep.id}: entity '${ep.entity}' not in db.entities`);
      continue;
    }
    for (const f of ep.inputFields) if (!fields.has(f)) errors.push(`api.endpoint.${ep.id}: inputFields has unknown '${f}'`);
    for (const f of ep.outputFields)
      if (!fields.has(f)) errors.push(`api.endpoint.${ep.id}: outputFields has unknown '${f}'`);
  }

  const apiIds = new Set(bundle.schema.api.endpoints.map((e) => e.id));
  for (const s of bundle.schema.ui.screens) {
    if (s.submitToApi && !apiIds.has(s.submitToApi)) errors.push(`ui.screen.${s.id}: submitToApi '${s.submitToApi}' not found`);
    if (!s.entity) continue;
    const fields = entityFields.get(s.entity);
    if (!fields) errors.push(`ui.screen.${s.id}: entity '${s.entity}' not in db.entities`);
    for (const f of s.fields) if (fields && !fields.has(f)) errors.push(`ui.screen.${s.id}: fields has unknown '${f}'`);
  }

  const roles = new Set(bundle.schema.auth.roles);
  for (const ep of bundle.schema.api.endpoints) {
    for (const r of ep.rolesAllowed) if (!roles.has(r)) errors.push(`api.endpoint.${ep.id}: rolesAllowed unknown '${r}'`);
  }
  if (!roles.has(bundle.schema.auth.defaultRole)) errors.push(`auth.defaultRole '${bundle.schema.auth.defaultRole}' not in auth.roles`);

  return errors;
}

