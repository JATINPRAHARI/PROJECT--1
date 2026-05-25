import { AppSchemaSchema, validateStrict } from "../schemas.mjs";

function apiForEntity(entityName, roles) {
  const base = `/${entityName}`;
  return [
    { id: `${entityName}-list`, method: "GET", path: base, entity: entityName, action: "list" },
    { id: `${entityName}-get`, method: "GET", path: `${base}/:id`, entity: entityName, action: "get" },
    { id: `${entityName}-create`, method: "POST", path: base, entity: entityName, action: "create" },
    { id: `${entityName}-update`, method: "PUT", path: `${base}/:id`, entity: entityName, action: "update" },
    { id: `${entityName}-delete`, method: "DELETE", path: `${base}/:id`, entity: entityName, action: "delete" },
  ].map((e) => ({
    ...e,
    inputFields: [],
    outputFields: [],
    rolesAllowed: roles,
  }));
}

export function stageSchemaGeneration(design) {
  const dbEntities = design.entities.map((e) => ({ name: e.name, fields: e.fields }));
  const roles = design.roles;

  const endpoints = [];
  for (const e of design.entities) endpoints.push(...apiForEntity(e.name, roles));

  // Fill in endpoint field mappings from DB schema.
  const fieldNamesByEntity = new Map(dbEntities.map((e) => [e.name, e.fields.map((f) => f.name)]));
  for (const ep of endpoints) {
    if (!ep.entity) continue;
    const fields = fieldNamesByEntity.get(ep.entity) ?? [];
    ep.outputFields = fields;
    ep.inputFields = ep.action === "create" || ep.action === "update" ? fields.filter((f) => f !== "id") : [];
  }

  const screens = [];
  screens.push({ id: "dashboard", title: `${design.productName} Dashboard`, kind: "dashboard", fields: [] });
  for (const e of design.entities) {
    const fields = (fieldNamesByEntity.get(e.name) ?? []).filter((f) => f !== "id");
    screens.push({
      id: `${e.name}-list`,
      title: `${e.name} List`,
      kind: "list",
      entity: e.name,
      fields: [],
      submitToApi: `${e.name}-list`,
    });
    screens.push({
      id: `${e.name}-create`,
      title: `Create ${e.name}`,
      kind: "create",
      entity: e.name,
      fields,
      submitToApi: `${e.name}-create`,
    });
  }

  const schema = {
    ui: { screens },
    api: { endpoints },
    db: { entities: dbEntities },
    auth: { roles, defaultRole: design.policies.defaultRole },
    assumptions: design.assumptions,
    clarificationQuestions: design.clarificationQuestions,
  };

  const validated = validateStrict(AppSchemaSchema, schema);
  return validated.ok ? { ok: true, schema: validated.value } : { ok: false, schema, errors: validated.errors };
}

